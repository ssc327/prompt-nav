import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 80, scroll: { offset: 0, bodyRows: 4 }, view: {} },
}

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

test('the band shows the last prompt and steps back to earlier ones', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text, origin: e.origin }))
  for (const text of ['set up the database', 'add a login page', 'fix the failing test']) {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  }
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'prompt-nav', surface, ...BAND })
    expect(await ui.find({ text: /fix the failing test/ })).toBeDefined()
    expect(await ui.find({ text: /3\/3/ })).toBeDefined()
    await ui.press({ key: 'prev' })
    expect(await ui.find({ text: /add a login page/ })).toBeDefined()
    expect(await ui.find({ text: /2\/3/ })).toBeDefined()
    await ui.press({ key: 'next' })
    await ui.unmount()
  }
})

test('the /prompts pane lists every prompt', async ($, on) => {
  on('prompt.submit', ($, e) => ({ text: e.text, origin: e.origin }))
  for (const text of ['one', 'two']) {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
  }
  const ui = await $.ui.mount({
    plugin: 'prompt-nav', surface: 'desktop', component: 'Pane', requestId: 'prompt-nav',
    props: { title: 'Your prompts' } as never,
  })
  expect(await ui.find({ key: 'p0' })).toBeDefined()
  expect(await ui.find({ key: 'p1' })).toBeDefined()
  await ui.unmount()
})
