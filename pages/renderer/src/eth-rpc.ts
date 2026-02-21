type JsonRpcResponse<R> = { jsonrpc: '2.0'; id: number; result: R } | { jsonrpc: '2.0'; id: number; error: unknown };

export const ethCall = async (rpcUrl: string, params: { to: string; data: string }) => {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [params, 'latest'] }),
  });

  if (!response.ok) {
    throw new Error(`rpc_http_${response.status}`);
  }

  const body = (await response.json()) as JsonRpcResponse<string>;

  if ('error' in body) {
    throw new Error('rpc_error');
  }

  return body.result;
};
