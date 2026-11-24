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
  subscribeSession,
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
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
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
          시연용 계정으로 로그인해 주세요.
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
            autoComplete="current-password"
            maxLength={128}
          />
        </TextField>
        {error && (
          <Type variant="body" as="p" role="alert" color="fg.critical">
            {error}
          </Type>
        )}
        <ActionButton
          type="submit"
          variant="brandSolid"
          size="large"
          disabled={busy || !username.trim() || !password}
          loading={busy}
        >
          로그인
        </ActionButton>
      </form>
    </main>
  )
}
