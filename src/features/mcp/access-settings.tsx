import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { McpTokenControls } from "./token-controls";
import { listMcpTokens } from "./tokens";

export async function McpAccessSettings({ businessId }: { businessId: string }) {
  const tokens = await listMcpTokens(businessId);
  return (
    <Card className="scroll-mt-24 rounded-[16px] shadow-none" id="mcp">
      <CardHeader>
        <CardTitle className="text-[14px]">MCP access</CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect an assistant to your business using the Model Context Protocol.
          Each connection has its own access token, which you can revoke here.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            In a client that supports Streamable HTTP and bearer tokens, use your
            Folio address followed by <code className="text-foreground">/api/mcp</code>.
            Set the <code className="text-foreground">Authorization</code> header
            to <code className="text-foreground">Bearer YOUR_TOKEN</code>.
          </p>
          <p>
            Read access can view your business records and reports. Read and write
            access can also change records, issue invoices and record payments.
            Keep tokens private and use HTTPS when connecting over a network.
          </p>
        </div>
        <McpTokenControls now={new Date().toISOString()} tokens={tokens} />
      </CardContent>
    </Card>
  );
}
