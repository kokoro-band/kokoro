import { pipeline } from "@huggingface/transformers"

type Message = { role: string; content: string }
type Generator = (
  messages: Message[],
  options: {
    max_new_tokens: number
    do_sample: boolean
    tokenizer_encode_kwargs: { enable_thinking: boolean }
  }
) => Promise<unknown>

let generatorPromise: Promise<Generator> | null = null

function loadGenerator(id: number) {
  generatorPromise ??= pipeline(
    "text-generation",
    "onnx-community/Qwen3-0.6B-ONNX",
    {
      device: "webgpu",
      dtype: "q4f16",
      progress_callback: () => self.postMessage({ id, type: "loading" }),
    }
  ).then((generator) => generator as unknown as Generator)
  return generatorPromise
}

function generatedText(value: unknown): string {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== "object")
    throw new Error("모델 응답이 비어 있어요.")
  const output = value[0] as Record<string, unknown>
  const text = output.generated_text
  if (!Array.isArray(text) || !text.length)
    throw new Error("모델 응답이 비어 있어요.")
  const last = text.at(-1)
  if (!last || typeof last !== "object" || typeof last.content !== "string")
    throw new Error("모델 응답을 읽을 수 없어요.")
  return last.content
}

self.onmessage = async (
  event: MessageEvent<{ id: number; messages: Message[] }>
) => {
  const { id, messages } = event.data
  try {
    self.postMessage({ id, type: "loading" })
    const generator = await loadGenerator(id)
    self.postMessage({ id, type: "generating" })
    const result = await generator(messages, {
      max_new_tokens: 160,
      do_sample: false,
      tokenizer_encode_kwargs: { enable_thinking: false },
    })
    self.postMessage({ id, type: "result", text: generatedText(result) })
  } catch (error) {
    generatorPromise = null
    self.postMessage({
      id,
      type: "error",
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}
