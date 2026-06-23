/** Human-readable startup lines on stderr (MCP stdio must not write to stdout). */
export function printStartup(lines: string[]): void {
  for (const line of lines) {
    process.stderr.write(`[querygate] ${line}\n`)
  }
}
