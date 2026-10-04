import { createServer } from "node:http"

/** Test-only Gemini wire boundary. The browser and Spring remain real. */
export async function startGeminiStub() {
  const calls = []
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/calls") {
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify(calls))
      return
    }
    if (
      request.method !== "POST" ||
      request.url !== "/v1beta/models/gemini-3.1-flash-lite:generateContent"
    ) {
      response.writeHead(404).end()
      return
    }
    let raw = ""
    for await (const chunk of request) {
      raw += chunk
      if (raw.length > 100_000) {
        response.writeHead(413).end()
        return
      }
    }
    const payload = JSON.parse(raw)
    const context = JSON.parse(payload.contents[0].parts[0].text)
    const call = {
      message: context.message,
      context,
      schema: payload.generationConfig.responseJsonSchema,
      key: request.headers["x-goog-api-key"],
      completed: false,
    }
    calls.push(call)
    response.setHeader("Content-Type", "application/json")
    if (context.message.includes("호출 한도")) {
      response
        .writeHead(429)
        .end('{"error":{"message":"private-provider-detail"}}')
      call.completed = true
      return
    }
    const empty = {
      catalogId: null,
      placement: null,
      rotation: null,
      anchorCatalogId: null,
    }
    const intent =
      context.message.includes("비워") || context.message.includes("중단")
        ? { action: "CLEAR", ...empty }
        : context.message.includes("옆")
          ? {
              action: "ADD",
              catalogId: "plant-olive",
              placement: "NEAR_TARGET",
              rotation: null,
              anchorCatalogId: "sofa-cloud",
            }
          : {
              action: "ROTATE",
              catalogId: "chair-shell",
              placement: null,
              rotation: 90,
              anchorCatalogId: null,
            }
    const body = JSON.stringify({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: context.message.includes("잘못된 응답")
                  ? "not-json"
                  : JSON.stringify(intent),
              },
            ],
          },
        },
      ],
    })
    const respond = () => {
      if (!response.destroyed) response.end(body)
      call.completed = true
    }
    if (context.message.includes("응답 지연")) setTimeout(respond, 1000)
    else if (context.message.includes("중단")) setTimeout(respond, 250)
    else respond()
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      }),
  }
}
