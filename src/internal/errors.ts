// CLI-level failures. A CliError is an operator-facing refusal or usage error: it
// exits 2 and never carries a stack to the terminal. Server-side failures arrive as
// the SDK's GlError (RFC 7807 problem) and are printed by output.printProblem.

export class CliError extends Error {
  readonly code: number;
  constructor(message: string, code = 2) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}
