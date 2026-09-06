import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test as base } from "@playwright/test";

type FolioFixture = {
  tls: boolean;
  setupDefaults: { country?: string; currency?: string };
  folio: { origin: string; setupToken: string; restart: () => Promise<void> };
};

export const test = base.extend<FolioFixture>({
  tls: [false, { option: true }],
  setupDefaults: [{}, { option: true }],
  folio: async ({ tls, setupDefaults }, provide, testInfo) => {
    await access(".next/BUILD_ID").catch(() => {
      throw new Error("Build Folio with bun run build before running browser tests.");
    });
    const directory = await mkdtemp(join(tmpdir(), "folio-e2e-"));
    const portReservation = createServer();
    portReservation.listen(0, "127.0.0.1");
    await once(portReservation, "listening");
    const appPort = (portReservation.address() as AddressInfo).port;
    await new Promise<void>((resolve) => portReservation.close(() => resolve()));

    let logs = "";
    function startChild() {
      // Explicit empty values prevent local .env files from changing the test.
      const instance = spawn(process.execPath, [
        "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1",
        "--port", String(appPort),
      ], {
        env: {
          ...process.env,
          NODE_ENV: "production",
          FOLIO_DATA_DIR: directory,
          DATABASE_DIALECT: "",
          DATABASE_URL: "",
          DATABASE_POOL_SIZE: "",
          APP_SECRET: "",
          SETUP_TOKEN: "",
          DEFAULT_COUNTRY: setupDefaults.country ?? "",
          DEFAULT_CURRENCY: setupDefaults.currency ?? "",
          DEBUG: "false",
          FOLIO_CONFIG_DIR: "",
          FOLIO_PUBLIC_URL: "",
          BETTER_AUTH_URL: "",
          BETTER_AUTH_SECRET: "",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      instance.stdout.on("data", (chunk) => { logs += String(chunk); });
      instance.stderr.on("data", (chunk) => { logs += String(chunk); });
      return instance;
    }
    let child = startChild();
    let proxy: ReturnType<typeof createHttpsServer> | undefined;

    async function stopChild() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      await stopped;
      clearTimeout(timeout);
    }

    async function waitUntilReady() {
      const deadline = Date.now() + 30_000;
      while (true) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error(`Folio exited: ${logs}`);
        }
        const response = await fetch(`http://127.0.0.1:${appPort}/api/health/ready`, {
          signal: AbortSignal.timeout(1_000),
        }).catch(() => null);
        if (response?.ok) break;
        if (Date.now() > deadline) throw new Error(`Folio did not become ready: ${logs}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    try {
      await waitUntilReady();
      await access(join(directory, "app-secret"));
      await access(join(directory, "folio.sqlite"));

      let browserPort = appPort;
      if (tls) {
        const keyPath = join(directory, "key.pem");
        const certPath = join(directory, "cert.pem");
        execFileSync("openssl", [
          "req", "-x509", "-newkey", "rsa:2048", "-nodes",
          "-keyout", keyPath, "-out", certPath, "-days", "1",
          "-subj", "/CN=folio-e2e", "-addext", "subjectAltName=DNS:folio-e2e",
        ], { stdio: "ignore" });
        proxy = createHttpsServer({
          key: await readFile(keyPath),
          cert: await readFile(certPath),
        }, (request, response) => {
          const upstream = httpRequest({
            hostname: "127.0.0.1",
            port: appPort,
            path: request.url,
            method: request.method,
            // A real TLS terminator preserves Host and overwrites this header.
            headers: { ...request.headers, "x-forwarded-proto": "https" },
          }, (upstreamResponse) => {
            response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
            upstreamResponse.pipe(response);
          });
          upstream.on("error", () => {
            response.writeHead(502);
            response.end();
          });
          request.pipe(upstream);
        });
        proxy.listen(0, "127.0.0.1");
        await once(proxy, "listening");
        browserPort = (proxy.address() as AddressInfo).port;
      }

      await provide({
        origin: `${tls ? "https" : "http"}://folio-e2e:${browserPort}`,
        setupToken: (await readFile(join(directory, "setup-token"), "utf8")).trim(),
        restart: async () => {
          await stopChild();
          child = startChild();
          await waitUntilReady();
        },
      });
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("server.log", { body: logs, contentType: "text/plain" });
      }
      if (proxy) {
        proxy.closeAllConnections();
        await new Promise<void>((resolve) => proxy!.close(() => resolve()));
      }
      await stopChild();
      await rm(directory, { recursive: true, force: true });
    }
  },
});

export { expect } from "@playwright/test";
