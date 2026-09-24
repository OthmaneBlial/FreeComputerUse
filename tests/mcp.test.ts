import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport, type ElicitRequest } from '@modelcontextprotocol/server';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Agent } from '../src/agent/Agent.js';
import { PlanSchema } from '../src/actions/schema.js';
import { TraceStore } from '../src/history/TraceStore.js';
import type { LLMProvider } from '../src/llm/LLMProvider.js';
import { createMcpRuntime } from '../src/mcp/index.js';
import { FixtureProvider } from '../fixtures/FixtureProvider.js';
import { startFixtures } from '../fixtures/server.js';

async function connect(createAgent: (url: string) => Promise<{ agent: Agent; store: TraceStore }>, decide: 'approve' | 'reject' = 'approve') {
  const runtime = createMcpRuntime(createAgent), server = runtime.createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'free-computer-use-tests', version: '1.0.0' }, {
    capabilities: { elicitation: {} },
  });
  const prompts: ElicitRequest[] = [];
  client.setRequestHandler('elicitation/create', async request => {
    prompts.push(request);
    return { action: 'accept', content: { confirmed: decide === 'approve' } };
  });
  try {
    await client.connect(clientTransport);
  } catch (error) {
    await client.close(); await server.close(); await runtime.close();
    throw error;
  }
  return { runtime, server, client, prompts };
}

function parseText(result: Awaited<ReturnType<Client['callTool']>>) {
  const block = result.content.find(item => item.type === 'text');
  assert.ok(block && block.type === 'text');
  try { return JSON.parse(block.text) as Record<string, unknown>; }
  catch { throw new Error(`Expected JSON tool result, received: ${block.text}`); }
}

test('MCP exposes bounded tools and runs a verified task after human site approval', { timeout: 45_000 }, async () => {
  const fixture = await startFixtures();
  const provider: LLMProvider = {
    name: 'mcp-fixture',
    plan: async context => PlanSchema.parse({
      goal: context.goal, steps: ['Filter and inspect the local product table'],
      actions: [
        { type: 'fill', target: { label: 'Search products' }, value: 'keyboard' },
        { type: 'extract', target: { css: 'table' }, format: 'table', key: 'products' },
      ],
      completion: [{ type: 'input_value_equals', target: { label: 'Search products' }, value: 'keyboard' }], continue: false,
    }),
    repair: async () => { throw new Error('Unexpected repair'); },
  };
  const connected = await connect(async url => {
    const store = new TraceStore(':memory:');
    return { store, agent: new Agent({ store, provider, browser: { allowedOrigins: [new URL(url).origin] } }) };
  });
  try {
    const tools = await connected.client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['follow_task', 'inspect_page', 'start_task', 'stop_task']);
    const started = parseText(await connected.client.callTool({ name: 'start_task', arguments: { goal: 'Filter products and read the table', url: fixture.url + '/catalogue' } }));
    const taskId = started.taskId as string;
    assert.match(taskId, /^[0-9a-f-]{36}$/);
    const followed = parseText(await connected.client.callTool({ name: 'follow_task', arguments: { taskId } }));
    assert.equal(followed.status, 'completed');
    assert.equal(connected.prompts.length, 1);
    assert.match(connected.prompts[0]!.params.message, /Allow browser access/);
    assert.match(JSON.stringify(followed.extractions), /keyboard/);
    const inspected = parseText(await connected.client.callTool({ name: 'inspect_page', arguments: { taskId } }));
    assert.match(String(inspected.page), /Product catalogue/);
  } finally {
    await connected.client.close(); await connected.server.close(); await connected.runtime.close(); await fixture.close();
  }
});

test('MCP elicits a second human approval before submitting a sensitive form', { timeout: 45_000 }, async () => {
  const fixture = await startFixtures(), provider = new FixtureProvider();
  const connected = await connect(async url => {
    const store = new TraceStore(':memory:');
    const agent = new Agent({
      store, provider, vault: { profile: { firstName: 'Alex', lastName: 'Example', email: 'alex@example.test', country: 'France', message: 'Synthetic test message' }, files: {} },
      browser: { allowedOrigins: [new URL(url).origin] },
    });
    return { agent, store };
  });
  try {
    const started = parseText(await connected.client.callTool({ name: 'start_task', arguments: {
      goal: 'Fill the contact form and send my message using my profile.', url: fixture.url + '/demo',
    } }));
    const followed = parseText(await connected.client.callTool({ name: 'follow_task', arguments: { taskId: started.taskId as string } }));
    assert.equal(followed.status, 'completed');
    assert.equal(connected.prompts.length, 2);
    assert.match(connected.prompts[0]!.params.message, /Allow browser access/);
    assert.match(connected.prompts[1]!.params.message, /Potentially irreversible control: Send message/);
    assert.equal(provider.planCalls, 1);
  } finally {
    await connected.client.close(); await connected.server.close(); await connected.runtime.close(); await fixture.close();
  }
});

test('MCP refuses malformed URLs and a declined site approval reaches no site', { timeout: 30_000 }, async () => {
  let visits = 0;
  const site = createServer((_request, response) => { visits++; response.end('<h1>Local approval fixture</h1>'); });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const connected = await connect(async url => {
    const store = new TraceStore(':memory:');
    return { store, agent: new Agent({ store, browser: { allowedOrigins: [new URL(url).origin] } }) };
  }, 'reject');
  try {
    const invalid = await connected.client.callTool({ name: 'start_task', arguments: { goal: 'Read a page', url: 'file:///etc/passwd' } });
    assert.equal(invalid.isError, true);
    const started = parseText(await connected.client.callTool({ name: 'start_task', arguments: { goal: 'Read the local page', url: siteUrl } }));
    const taskId = started.taskId as string;
    const followed = parseText(await connected.client.callTool({ name: 'follow_task', arguments: { taskId } }));
    assert.equal(followed.status, 'failed');
    assert.equal(connected.prompts.length, 1);
    assert.equal(visits, 0);
  } finally {
    await connected.client.close(); await connected.server.close(); await connected.runtime.close();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});

test('the installed CLI serves modern MCP over stdio without opening an HTTP endpoint', { timeout: 45_000 }, async () => {
  let visits = 0;
  const site = createServer((_request, response) => { visits++; response.end('<h1>Stdio approval fixture</h1>'); });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const workDir = await mkdtemp(join(tmpdir(), 'fcu-mcp-stdio-'));
  const dataDir = join(workDir, 'data');
  const client = new Client({ name: 'free-computer-use-stdio-tests', version: '1.0.0' }, {
    capabilities: { elicitation: {} }, versionNegotiation: { mode: 'auto' },
  });
  const prompts: ElicitRequest[] = [];
  client.setRequestHandler('elicitation/create', async request => {
    prompts.push(request);
    return { action: 'accept', content: { confirmed: false } };
  });
  const transport = new StdioClientTransport({
    command: resolve('node_modules/.bin/tsx'), args: [resolve('src/cli/index.ts'), 'mcp'], cwd: workDir,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', FCU_DATA_DIR: dataDir, FCU_BROWSER_CHANNEL: 'chrome' },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['follow_task', 'inspect_page', 'start_task', 'stop_task']);
    const started = parseText(await client.callTool({ name: 'start_task', arguments: { goal: 'Read the local page', url: siteUrl } }));
    const followed = parseText(await client.callTool({ name: 'follow_task', arguments: { taskId: started.taskId as string } }));
    assert.equal(followed.status, 'failed');
    assert.equal(prompts.length, 1);
    assert.equal(visits, 0);
  } finally {
    await client.close();
    await rm(workDir, { recursive: true, force: true });
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
