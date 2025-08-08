
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { docParseWorkflow } from './workflows/docParseWorkflow';
import { pdfUrlWorkflow } from './workflows/pdfUrlWorkflow';
import { pdfAgent } from './agents/pdfAgent';

export const mastra = new Mastra({
  agents: { pdfAgent },
  workflows: { 
    docParseWorkflow,
    pdfUrlWorkflow,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra DocOps',
    level: 'info',
  }),
});
