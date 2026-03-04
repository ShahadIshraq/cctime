# ccworktime

Calculate how much time you've spent working with Claude Code, based on your local session logs.

## Install

### Homebrew (macOS / Linux)

```sh
brew install ShahadIshraq/tap/ccworktime
```

### Download binary

Grab the latest binary from [GitHub Releases](https://github.com/ShahadIshraq/ccworktime/releases):

```sh
# macOS (Apple Silicon)
curl -fsSL https://github.com/ShahadIshraq/ccworktime/releases/latest/download/ccworktime-darwin-arm64.tar.gz | tar xz
sudo mv ccworktime-darwin-arm64 /usr/local/bin/ccworktime

# macOS (Intel)
curl -fsSL https://github.com/ShahadIshraq/ccworktime/releases/latest/download/ccworktime-darwin-x64.tar.gz | tar xz
sudo mv ccworktime-darwin-x64 /usr/local/bin/ccworktime

# Linux (x64)
curl -fsSL https://github.com/ShahadIshraq/ccworktime/releases/latest/download/ccworktime-linux-x64.tar.gz | tar xz
sudo mv ccworktime-linux-x64 /usr/local/bin/ccworktime

# Windows (x64, PowerShell)
Invoke-WebRequest -Uri https://github.com/ShahadIshraq/ccworktime/releases/latest/download/ccworktime-windows-x64.zip -OutFile ccworktime.zip
Expand-Archive ccworktime.zip -DestinationPath .
Move-Item ccworktime-windows-x64.exe "$env:LOCALAPPDATA\Microsoft\WindowsApps\ccworktime.exe"
```

### npm (requires Node.js >= 18)

```sh
npx ccworktime
```

Or install globally:

```sh
npm install -g ccworktime
```

## Usage

```
ccworktime [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--today` | Show today's work time | (default) |
| `--yesterday` | Show yesterday's work time | |
| `--week` | Show current week (Mon–Sun) | |
| `--month` | Show current month | |
| `--from <YYYY-MM-DD>` | Start date | today |
| `--to <YYYY-MM-DD>` | End date | today |
| `--pause <minutes>` | Inactivity gap to split sessions | 10 |
| `--overlap merge\|accumulate` | Cross-project overlap handling | merge |
| `--project <path>` | Filter to a project directory (repeatable) | |
| `--no-subagents` | Exclude subagent (Task tool) activity | |
| `--claude-dir <path>` | Override `~/.claude` directory | |
| `--version`, `-v` | Show version number | |
| `--help`, `-h` | Show help message | |

## Examples

```sh
# Today's total
ccworktime

# All of February
ccworktime --from 2026-02-01 --to 2026-02-28

# This week, one project only
ccworktime --week --project ~/workspace/myapp

# Tighter session gap, accumulate overlaps
ccworktime --pause 5 --overlap accumulate

# Yesterday, no subagent time
ccworktime --yesterday --no-subagents
```

## Sample Output

```
=== Claude Code Work Time Report ===
Period: 2026-03-03 to 2026-03-03

  2026-03-03  3h 02m
    09:15 - 11:29  (2h 14m)
    14:00 - 14:48  (0h 48m)

  Total:      3h 02m
=================================
```

## How It Works

1. Reads JSONL conversation logs from `~/.claude/`
2. Extracts message timestamps per project
3. Clusters timestamps into work blocks using the pause threshold
4. Merges (or accumulates) overlapping blocks across projects
5. Reports total focused work time per day

## Requirements

- Node.js >= 18
- Claude Code installed and used at least once

## License

MIT
