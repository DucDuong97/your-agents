import { NextResponse } from 'next/server';

export type ToolTextResult = { type: 'text'; text: string };
export type ToolResponse = { content: ToolTextResult[]; isError?: boolean };

export function ok(text: string): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }] };
  return NextResponse.json(body);
}

export function err(text: string, status = 400): NextResponse {
  const body: ToolResponse = { content: [{ type: 'text', text }], isError: true };
  return NextResponse.json(body, { status });
}
