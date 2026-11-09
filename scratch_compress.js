const { TextEncoder, TextDecoder } = require('util');

async function test() {
  const string = "hello world".repeat(100);
  console.log("Original size:", string.length);
  // Node 18+ has CompressionStream globally
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(string));
  writer.close();
  const res = new Response(cs.readable);
  const buffer = await res.arrayBuffer();
  const b64 = Buffer.from(buffer).toString('base64');
  console.log("Compressed base64 size:", b64.length);
  
  const binary = Buffer.from(b64, 'base64');
  const ds = new DecompressionStream('deflate-raw');
  const writer2 = ds.writable.getWriter();
  writer2.write(binary);
  writer2.close();
  const res2 = new Response(ds.readable);
  const buffer2 = await res2.arrayBuffer();
  console.log("Decompressed:", new TextDecoder().decode(buffer2).slice(0, 100));
}
test();
