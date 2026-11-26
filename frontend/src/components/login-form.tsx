import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { CogIcon, LogInIcon } from "lucide-react"
import { cn } from "cn"

import { useAuth } from "@/context/AuthContext"
import { ApiError } from "@/lib/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      await login(username, password)
      navigate("/")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to connect to server")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="font-tech rounded-2xl bg-card/95 py-10 shadow-xl backdrop-blur-sm">
        <CardHeader className="flex flex-col items-center gap-0 px-10 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <CogIcon className="size-8" strokeWidth={1.75} />
          </div>
          <h1 className="font-tech text-3xl font-bold tracking-wide">SIMFATI</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Facility Maintenance Management System
          </p>
        </CardHeader>

        <CardContent className="px-10">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel
                  htmlFor="username"
                  className="text-sm font-bold uppercase tracking-wider text-primary"
                >
                  Username
                </FieldLabel>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="h-12 rounded-xl bg-muted/50 px-4 text-lg md:text-lg"
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor="password"
                  className="text-sm font-bold uppercase tracking-wider text-primary"
                >
                  Password
                </FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-12 rounded-xl bg-muted/50 px-4 text-lg md:text-lg"
                />
              </Field>
              <Field className="pt-2">
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 rounded-xl text-base font-bold uppercase tracking-wider"
                  disabled={submitting}
                >
                  <LogInIcon className="size-5" />
                  {submitting ? "Signing in..." : "Sign In"}
                </Button>
              </Field>
            </FieldGroup>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} PT Sari Takagi Elok Produk
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
