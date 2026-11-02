import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react"
import { ActionButton } from "@seed-design/react"
import { TextField, TextFieldInput } from "seed-design/ui/text-field"

import {
  authRequired,
  currentSession,
  login,
  passwordError,
  signup,
  subscribeSession,
  usernameError,
} from "@/lib/auth"
import { Type } from "@/components/kokoro/Type"
import { normalizeApiError } from "@/lib/http-client"

/** Shows the login screen first when the build asks for a demo login. */
export function AuthGate({
  required = authRequired,
  children,
}: {
  required?: boolean
  children: ReactNode
}) {
  const session = useSyncExternalStore(subscribeSession, currentSession)
  if (!required || session) return <>{children}</>
  return <LoginScreen />
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const signingUp = mode === "signup"

  function switchMode() {
    setMode(signingUp ? "login" : "signup")
    setPassword("")
    setConfirm("")
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (signingUp) {
      const problem =
        usernameError(username) ??
        passwordError(password) ??
        (password === confirm ? null : "비밀번호가 서로 달라요.")
      if (problem) {
        setError(problem)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      if (signingUp) await signup(username.trim(), password)
      else await login(username.trim(), password)
    } catch (caught) {
      setError(normalizeApiError(caught).message)
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <Type variant="display" as="h1">
          코코로 리모델링 스튜디오
        </Type>
        <Type variant="description" as="p">
          {signingUp
            ? "아이디와 비밀번호만 정하면 바로 시작할 수 있어요."
            : "계정으로 로그인하거나 새로 가입해 주세요."}
        </Type>
        <TextField
          label="아이디"
          size="medium"
          value={username}
          onValueChange={({ value }) => setUsername(value)}
          required
        >
          <TextFieldInput
            name="username"
            autoComplete="username"
            autoFocus
            maxLength={64}
          />
        </TextField>
        <TextField
          label="비밀번호"
          size="medium"
          value={password}
          onValueChange={({ value }) => setPassword(value)}
          required
        >
          <TextFieldInput
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            maxLength={128}
          />
        </TextField>
        {signingUp && (
          <TextField
            label="비밀번호 확인"
            size="medium"
            value={confirm}
            onValueChange={({ value }) => setConfirm(value)}
            required
          >
            <TextFieldInput
              name="password-confirm"
              type="password"
              autoComplete="new-password"
              maxLength={128}
            />
          </TextField>
        )}
        {error && (
          <Type variant="body" as="p" role="alert" color="fg.critical">
            {error}
          </Type>
        )}
        <ActionButton
          type="submit"
          variant="brandSolid"
          size="large"
          disabled={
            busy || !username.trim() || !password || (signingUp && !confirm)
          }
          loading={busy}
        >
          {signingUp ? "가입하고 시작하기" : "로그인"}
        </ActionButton>
        <ActionButton
          type="button"
          variant="neutralWeak"
          size="large"
          disabled={busy}
          onClick={switchMode}
        >
          {signingUp ? "로그인으로 돌아가기" : "회원가입"}
        </ActionButton>
      </form>
    </main>
  )
}
