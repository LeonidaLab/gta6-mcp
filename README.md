# Leonida Lab MCP server: GTA 6 facts, official or not

Ask Claude, ChatGPT, Cursor or any MCP client about GTA 6 (Grand Theft Auto VI) and it answers from [Leonida Lab](https://leonidalab.com/), with the status attached to every fact:

- **Official**: Rockstar Games, Take-Two, Sony or Microsoft said it on the record.
- **Reported**: credible press has it, nobody official has confirmed it.
- **Not announced**: nobody official has said anything.

Each answer also carries its source, the source's date and a link to the page. Assistants get GTA 6 wrong all the time (a PC date, a 60 FPS mode, a local price); this is the fix.

Free, read-only, no account.

- **Website:** [leonidalab.com](https://leonidalab.com/), the GTA VI database, trackers and calculators
- **Setup guide:** [leonidalab.com/mcp-server](https://leonidalab.com/mcp-server/)

> **Unofficial.** Leonida Lab is a fan resource. It is not affiliated with, endorsed by, or connected to Rockstar Games or Take-Two Interactive. It publishes no leaked material.

## Connect

The hosted server needs no install:

```
https://leonidalab.com/mcp
```

- **Claude** (claude.ai and the desktop app): Settings, then Connectors, then Add custom connector, with the address above.
- **Claude Code:** `claude mcp add --transport http leonidalab https://leonidalab.com/mcp`
- **Cursor** (`.cursor/mcp.json`) and other clients that read `mcpServers`:

  ```json
  { "mcpServers": { "leonidalab": { "url": "https://leonidalab.com/mcp" } } }
  ```

- **VS Code** (`.vscode/mcp.json`):

  ```json
  { "servers": { "leonidalab": { "type": "http", "url": "https://leonidalab.com/mcp" } } }
  ```

- **Local (stdio)**, for clients that only run local servers: `npx -y github:LeonidaLab/gta6-mcp`. It loads the current data from leonidalab.com once at start-up.

## Tools

| Tool | Answers |
|---|---|
| `check_claim` | Is it confirmed? Checks a claim (a PC version, 60 FPS, online at launch, a disc, crossplay, map size, story length and more) against the tracked claims, the FAQ and the PC, frame rate, online and length pages. Each match comes back official, reported or not announced, with its sources. A miss says what is covered and guesses nothing. |
| `release_info` | The release date, the platforms, the unlock time in each region or in the place you name, and the dates around launch. The unlock hour carries its own status (a press report until Rockstar publishes it), and the answer says which. |
| `price_in_country` | What a buyer pays at checkout in one country, Standard and Ultimate, on the PlayStation Store and the Xbox Store, with the US dollar value. Tax is included where the store adds one national rate; where the rate varies or could not be confirmed, the price is labelled and never called cheaper. |
| `compare_editions` | Standard against Ultimate, every Ultimate bonus as Rockstar lists it, the pre-order bonus and its deadline, and the fact that there is no disc. |
| `recent_changes` | What changed on the record, newest first. Optionally since a date. |

All tools are read-only.

## Try asking

- Is GTA 6 coming to PC?
- Is 60 FPS confirmed for GTA 6?
- What time does GTA 6 unlock in Germany?
- How much is GTA 6 in Brazil, tax included?
- What do I get with the Ultimate Edition?
- What changed about GTA 6 this month?

## The pages behind the answers

[What's confirmed](https://leonidalab.com/confirmed/) · [Release date](https://leonidalab.com/release-date/) · [Countdown and unlock times](https://leonidalab.com/countdown/) · [Is it coming to PC?](https://leonidalab.com/pc/) · [Frame rate: 30 or 60?](https://leonidalab.com/performance/) · [Is there online?](https://leonidalab.com/online/) · [How long to beat](https://leonidalab.com/how-long-to-beat/) · [Editions compared](https://leonidalab.com/editions/) · [Price by country](https://leonidalab.com/data/price-index/) · [FAQ](https://leonidalab.com/faq/) · [Changelog](https://leonidalab.com/changelog/)

## The data

The answers come from the same data as every page on leonidalab.com: [/api/data.json](https://leonidalab.com/api/data.json) and the [GTA VI Global Price Index](https://leonidalab.com/data/price-index/), rebuilt with each update.

- **No leaks, ever.** Only what is on the record or credibly reported, each tagged as such ([the no-leaks policy](https://leonidalab.com/no-leaks/)). A detail that only ever leaked is answered with "not on the record".
- **No guessed numbers.** A figure is either in the data or derived the way the site derives it (a price with the store's own tax rate added, a midnight converted to UTC).
- **Price data:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), also on GitHub as [LeonidaLab/gta6-price-index](https://github.com/LeonidaLab/gta6-price-index). Credit Leonida Lab and link the page.
- **Code:** MIT.
- **Privacy:** no account, no cookies. Leonida Lab does not store or log what you ask.

The hosted endpoint runs this code (`src/`) as a Cloudflare Pages Function. It is listed in the official MCP Registry as `com.leonidalab/gta6-facts`.

---

Made by [Leonida Lab](https://leonidalab.com/), the GTA VI database where every fact is tagged and cites its source. Grand Theft Auto and related marks are trademarks of Take-Two Interactive.
