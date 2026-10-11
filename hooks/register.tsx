import { atom, read, update } from 'claude-code'
import type { PromptList } from '../types'
import type { EngineInterface, Register } from 'claude-code'

// prompt-nav: keeps the prompts you sent this session, shows the latest one in
// a band above the input, and lets you step up and down the chat between them
// (▲ / ▼), or pick one from a list (/prompts).

const PANE = 'prompt-nav'
const prompts = atom({ plugin: 'prompt-nav', key: 'prompts' } as const, [] as PromptList)
const cursor = atom({ plugin: 'prompt-nav', key: 'cursor' } as const, null)
const isHidden = atom({ plugin: 'prompt-nav', key: 'isHidden' } as const, false)

const PERSON = new Set(['composer', 'bridge', 'sdk'])

const norm = (text: string) => text.replace(/\s+/g, ' ').trim()

const isPrompt = (text: string) => {
  const t = norm(text)
  return t !== '' && !t.startsWith('<') && !t.startsWith('Caveat:')
}

const clip = (text: string, max: number) => {
  const t = norm(text)
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + '…' : t
}

// Transcript row ids of your prompts, by text, in the order they were drawn.
// Filled while the rows are drawn; scrolling needs a row's id.
const idsByText = new Map<string, string[]>()

function rowIdFor(list: readonly string[], index: number) {
  const text = norm(list[index] ?? "")
  let nth = 0
  for (let i = 0; i < index; i++) if (norm(list[i] ?? "") === text) nth++
  return idsByText.get(text)?.[nth]
}

// Every transcript row the surface has drawn, in the order it first drew them.
// While we walk up the chat, the rows drawn last are the ones at the top.
const drawn: string[] = []
const drawnSet = new Set<string>()

function noteDrawn(id: string) {
  if (drawnSet.has(id)) return
  drawnSet.add(id)
  drawn.push(id)
  if (drawn.length > 5000) drawnSet.delete(drawn.shift() ?? '')
}

// The topmost prompt row we know of below the target: where a walk starts.
function startAnchor(list: readonly string[], target: number) {
  for (let i = target + 1; i < list.length; i++) {
    const id = rowIdFor(list, i)
    if (id !== undefined) return id
  }
  return drawn[0]
}

const STEPS = 60
const SETTLE_MS = 120

let walking = 0

async function jump($: EngineInterface, index: number) {
  const list = await read($, prompts)
  if (list.length === 0) return
  const i = Math.max(0, Math.min(list.length - 1, index))
  await update($, cursor, () => i)
  const walk = ++walking

  // Not drawn yet: show the top of what is drawn, let the surface draw the rows
  // above it, and go again from the new top until the prompt's row exists.
  let anchor = rowIdFor(list, i) === undefined ? startAnchor(list, i) : undefined
  let stalled = 0
  for (let step = 0; step < STEPS && rowIdFor(list, i) === undefined; step++) {
    if (walk !== walking) return // a newer press took over
    if (anchor === undefined) break
    const before = drawn.length
    const moved = await $.ui.scroll({ to: { requestId: anchor }, block: 'end' })
    if (moved.deny !== undefined) {
      $.ui.toast(`Couldn't scroll up: ${moved.deny}`)
      return
    }
    await $.clock.sleep(SETTLE_MS)
    if (drawn.length > before) {
      anchor = drawn[drawn.length - 1] // the newest row drawn is the new top
      stalled = 0
    } else if (++stalled >= 3) {
      break
    }
  }

  const id = rowIdFor(list, i)
  if (id === undefined) {
    $.ui.toast(`Couldn't reach prompt ${i + 1}: this view won't draw further up`)
    return
  }
  const moved = await $.ui.scroll({ to: { requestId: id }, block: 'start' })
  if (moved.deny !== undefined) $.ui.toast(`Couldn't scroll there: ${moved.deny}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prompts',
      description: 'List the prompts you sent in this session and jump to one',
    })
    // A resumed session (or a reload) already has prompts: seed from the transcript.
    const messages = await $.session.messages()
    if (Array.isArray(messages)) {
      const seen = messages
        .filter(m => m.role === 'user' && !(m.toolResults?.length) && isPrompt(m.text))
        .map(m => norm(m.text))
      if (seen.length > 0) await update($, prompts, () => seen)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (result.drop === undefined && isPrompt(result.text)) {
      const kind = result.origin?.kind ?? e.origin?.kind
      if (kind === undefined || PERSON.has(kind)) {
        await update($, prompts, list => [...list, norm(result.text)].slice(-500))
        await update($, cursor, () => null)
        await update($, isHidden, () => false)
      }
    }
    return result
  })

  on('command.run', { command: 'prompts' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Your prompts' })
    const n = (await read($, prompts)).length
    return { text: n === 0 ? 'No prompts yet.' : `${n} prompts. Pick one to jump to it.` }
  })

  // Remember which transcript row holds which prompt, then draw it as usual.
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    noteDrawn(e.requestId)
    if (PERSON.has(e.props.origin.kind) && isPrompt(e.props.text)) {
      const text = norm(e.props.text)
      const ids = idsByText.get(text) ?? []
      if (!ids.includes(e.requestId)) idsByText.set(text, [...ids, e.requestId])
    }
    return next(e)
  })

  // Claude's replies and tool rows count as drawn rows too: they are what a
  // walk up a long stretch of work steps over.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    noteDrawn(e.requestId)
    return next(e)
  })
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    noteDrawn(e.requestId)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, prompts)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const n = list.length
    const at = (await read($, cursor)) ?? n - 1
    const room = Math.max(20, (e.props.bodyColumns ?? 80) - 2)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text dimColor>{at === n - 1 ? 'Last prompt' : 'Prompt'} {at + 1}/{n}  </Text>
          <Button key="prev" label="▲ Prev" onPress={() => jump($, at - 1)} />
          <Text> </Text>
          <Button key="next" label="▼ Next" onPress={() => jump($, at + 1)} />
          <Text> </Text>
          <Button key="all" label="All" onPress={() => $.ui.open({ id: PANE, title: 'Your prompts' })} />
          <Text> </Text>
          <Button key="hide" label="Hide" plain onPress={() => update($, isHidden, () => true)} />
        </Box>
        <Text wrap="truncate-end">↳ {clip(list[at] ?? "", room * 2)}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, prompts)
    const at = await read($, cursor)
    const width = Math.max(20, (e.props.bodyColumns ?? 60) - 8)

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No prompts yet.</Text>}
        {list.map((text, i) => (
          <Button key={`p${i}`} plain onPress={() => jump($, i)}>
            {at === i ? '▶ ' : '  '}
            <Text dimColor>{String(i + 1).padStart(2)}.</Text> {clip(text, width)}
          </Button>
        ))}
      </Box>
    )
  })
}
