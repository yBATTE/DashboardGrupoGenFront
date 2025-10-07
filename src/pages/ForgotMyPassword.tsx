import React, { useState } from "react";
import { forgotPassword } from "../api/users";

/**
 * Ajusta la ruta de import según donde esté definida tu función forgotPassword.
 * Ejemplo: import { forgotPassword } from "../services/auth";
 */

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotMyPassword(): JSX.Element {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setError(null);

        if (!email) {
            setError("Por favor ingresa tu email.");
            return;
        }
        if (!emailRegex.test(email)) {
            setError("Por favor ingresa un email válido.");
            return;
        }

        setLoading(true);
        try {
            const res = await forgotPassword(email);
            if (res?.ok) {
                setMessage(
                    "Si el email existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña."
                );
                setEmail("");
            } else {
                // Puede venir message desde el backend
                setError(res?.message ?? "No se pudo procesar la solicitud. Intenta de nuevo.");
            }
        } catch (err) {
            console.error(err);
            setError("Error de red. Intenta de nuevo más tarde.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ maxWidth: 480, margin: "3rem auto", padding: "1rem" }}>
            <h1 style={{ marginBottom: "1rem" }}>Recuperar contraseña</h1>

            <form onSubmit={submit}>
                <label htmlFor="email" style={{ display: "block", marginBottom: ".5rem" }}>
                    Correo electrónico
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@ejemplo.com"
                    required
                    style={{
                        width: "100%",
                        padding: ".5rem",
                        marginBottom: ".75rem",
                        boxSizing: "border-box",
                    }}
                    aria-invalid={!!error}
                />

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        padding: ".6rem 1rem",
                        cursor: loading ? "not-allowed" : "pointer",
                    }}
                >
                    {loading ? "Enviando..." : "Enviar instrucciones"}
                </button>
            </form>

            {message && (
                <p role="status" style={{ marginTop: "1rem", color: "green" }}>
                    {message}
                </p>
            )}
            {error && (
                <p role="alert" style={{ marginTop: "1rem", color: "crimson" }}>
                    {error}
                </p>
            )}
        </main>
    );
}