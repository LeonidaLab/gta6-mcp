#!/usr/bin/env node
// The same server over stdio, for clients that only run local servers. It loads the current
// data from leonidalab.com once at start-up; the hosted endpoint needs no install.
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from './src/server.mjs';

const SITE = 'https://leonidalab.com';
async function load(path) {
  const res = await fetch(`${SITE}${path}`);
  if (!res.ok) {
    console.error(`gta6-mcp: could not load ${SITE}${path} (${res.status})`);
    process.exit(1);
  }
  return res.json();
}
const [data, prices] = await Promise.all([load('/api/data.json'), load('/data/gta6-price-index.json')]);
await createServer({ data, prices }).connect(new StdioServerTransport());
