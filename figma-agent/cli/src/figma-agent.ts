// figma-agent CLI entry: plain argv dispatch (no arg-parsing dependency).
// Hidden subcommand `__broker` runs the persistent relay daemon in-process.
// Every visible command prints exactly ONE JSON object and exits 0/1.
import { runBrokerDaemon } from './transport/broker-daemon.ts';
import { parseArgs, type CommandArgs } from './arg-parse.ts';
import { CliError } from './transport/protocol-helpers.ts';
import { printErrorJson, printJson } from './util/json-out.ts';
import * as batch from './commands/batch.ts';
import * as bindVariable from './commands/bind-variable.ts';
import * as capture from './commands/capture.ts';
import * as createFrame from './commands/create-frame.ts';
import * as createInstance from './commands/create-instance.ts';
import * as createVariable from './commands/create-variable.ts';
import * as execJs from './commands/exec-js.ts';
import * as exportPng from './commands/export-png.ts';
import * as getSelection from './commands/get-selection.ts';
import * as htmlToFigma from './commands/html-to-figma.ts';
import * as mirrorVerify from './commands/mirror-verify.ts';
import * as scanDesignSystem from './commands/scan-design-system.ts';
import * as scanNode from './commands/scan-node.ts';
import * as scanConventions from './commands/scan-conventions.ts';
import * as auditDs from './commands/audit-ds.ts';
import * as setAutolayout from './commands/set-autolayout.ts';
import * as setConstraints from './commands/set-constraints.ts';
import * as seat from './commands/seat.ts';
import * as setText from './commands/set-text.ts';
import * as setVariant from './commands/set-variant.ts';
import * as status from './commands/status.ts';

// Re-exported so command files keep `import type { CommandArgs } from '../figma-agent.ts'`.
export type { CommandArgs } from './arg-parse.ts';

const COMMAND_MODULES: Record<string, { run(args: CommandArgs): Promise<unknown> }> = {
  status,
  seat,
  'get-selection': getSelection,
  'scan-design-system': scanDesignSystem,
  'scan-node': scanNode,
  'mirror-verify': mirrorVerify,
  'scan-conventions': scanConventions,
  'audit-ds': auditDs,
  'create-frame': createFrame,
  'create-instance': createInstance,
  'set-variant': setVariant,
  'create-variable': createVariable,
  'bind-variable': bindVariable,
  'set-autolayout': setAutolayout,
  'set-constraints': setConstraints,
  'set-text': setText,
  'export-png': exportPng,
  'html-to-figma': htmlToFigma,
  'exec-js': execJs,
  capture,
  batch,
};

const HELP = `figma-agent — CLI bridge to the Figma plugin (via a local WS broker)

Usage: figma-agent <command> [options]

Commands:
  status               Broker + plugin connection info
  seat                 Probe seat → {seat, bridge, reason} [--seat free|paid skips the probe]
  get-selection        Serialize the current selection [--depth 1]
  scan-design-system   Components/variables/styles registry [--out file.json --timeout ms]
  scan-node            [SPIKE] Reverse-walk one node → FigmaExportNode spec <nodeId> [--timeout ms]
  mirror-verify        Prove one node round-trips: scan → rebuild → scan → diff <nodeId> [--parent id --keep --timeout ms]
  scan-conventions     Convention-DNA walk over sections → usage-dna.json [<sectionId...> --out file.json --budget 14000 --timeout ms]
  audit-ds             DS-hygiene audit of the open file's component library [--out file.json --sections "01 A,02 B" --facts raw.json --from-facts raw.json --timeout ms]
  create-frame         --name n --w 400 --h 300 [--parent id --x 0 --y 0]
  create-instance      --component <key|id> [--parent id]
  set-variant          --node id --props k=v,k2=v2
  create-variable      --collection c --name n --type COLOR|FLOAT|STRING|BOOLEAN --value v [--mode m]
  bind-variable        --node id --field fills|cornerRadius|... --variable <id|name>
  set-autolayout       --node id --mode H|V|GRID|NONE [--gap n --pad t,r,b,l --align-primary --align-counter --wrap --sizing-h --sizing-v --rows n --cols n --col-sizes ...]
  set-constraints      --node id --h MIN|MAX|CENTER|STRETCH|SCALE --v MIN|MAX|CENTER|STRETCH|SCALE
  set-text             --node id --chars "..." [--font f --size n --weight n]
  export-png           --node <id|selection> --out file.png [--scale 2]
  html-to-figma        --html <file|-> [--width 1280 --x --y --parent id --replace id]
  exec-js              <file|-> [--timeout ms (cap 120000)]
  capture              <url> [--out dir --headless --channel chrome --width 1440 --timeout ms --carousel-window ms]
  batch                <file.json> [--stop-on-error]

All commands print one JSON object to stdout and exit 0, or {error:{code,message}} and exit 1.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];

  if (name === '__broker') {
    await runBrokerDaemon(); // daemon never returns until shutdown
    return;
  }
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(HELP);
    process.exit(name ? 0 : 1);
  }
  const command = COMMAND_MODULES[name];
  if (!command) {
    printErrorJson(new CliError('E_INVALID_ARGS', `unknown command "${name}" — run figma-agent --help`));
  }
  try {
    const result = await command.run(parseArgs(argv.slice(1)));
    printJson(result);
    process.exit(0);
  } catch (err) {
    printErrorJson(err);
  }
}

main().catch((err) => printErrorJson(err));
