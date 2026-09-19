import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios"
import { describe, expect, it } from "vitest"

import {
  ApiError,
  httpClient,
  normalizeApiError,
  REQUEST_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
} from "./http-client"

function axiosError(status?: number, data?: unknown) {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse | undefined =
    status === undefined
      ? undefined
      : {
          data,
          status,
          statusText: "Error",
          headers: new AxiosHeaders(),
          config,
        }
  return new AxiosError(
    "request failed",
    undefined,
    config,
    undefined,
    response
  )
}

describe("normalizeApiError", () => {
  it("marks network failures as retryable", () => {
    const error = normalizeApiError(axiosError())

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBeNull()
    expect(error.retryable).toBe(true)
    expect(error.message).toContain("연결")
  })

  it("does not retry a 404", () => {
    const error = normalizeApiError(axiosError(404))

    expect(error.status).toBe(404)
    expect(error.retryable).toBe(false)
    expect(error.message).toBe("요청한 프로젝트를 찾을 수 없습니다.")
  })

  it("uses bounded server details for other client errors", () => {
    const error = normalizeApiError(
      axiosError(422, {
        detail: `프로젝트 이름을 확인해 주세요.${"x".repeat(300)}`,
      })
    )

    expect(error.message).toHaveLength(200)
    expect(error.message).toMatch(/^프로젝트 이름을 확인해 주세요\./)
    expect(error.retryable).toBe(false)
  })

  it("marks temporary server failures as retryable", () => {
    expect(normalizeApiError(axiosError(503)).retryable).toBe(true)
  })
})

describe("request timeouts", () => {
  it("uses a finite default and a longer upload timeout", () => {
    expect(httpClient.defaults.timeout).toBe(REQUEST_TIMEOUT_MS)
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(REQUEST_TIMEOUT_MS)
  })
})
