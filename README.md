# prompt-nav

A Claude Code mod for long sessions. It shows the last prompt you sent and lets you hop up and down the chat from one of your prompts to the next.

- **A strip above the input box** shows your latest prompt, e.g. `Last prompt 7/7 ↳ fix the failing test`.
- **▲ Prev / ▼ Next** step through your own prompts and scroll the chat to each one.
- **All**, or `/prompts`, opens a panel listing every prompt. Pick one to jump to it.
- **Hide** tucks the strip away until your next prompt.
- A resumed session picks up the prompts already in it.

If a prompt is so far up that the app hasn't drawn it yet, the jump walks there: it scrolls to the top of what is drawn, waits for the rows above to draw, and repeats until the prompt appears.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-nav --marketplace <owner>/<repo>
```

Answer `y` to add the marketplace, then press Enter to install for your user. It is active right away. Installed at the user scope, it also loads in the Claude desktop app's Code tab.

## Where it works

| Where | Strip and list | Jumping |
| --- | --- | --- |
| Desktop app, VS Code, mobile | yes | yes |
| Terminal, fullscreen layout | yes | yes |
| Terminal, plain scrollback | yes | no: the terminal app owns that scrollback |

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
