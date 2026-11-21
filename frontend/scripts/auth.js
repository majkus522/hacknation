(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:8000";
    const SESSION_KEY = "perun_auth_session_v1";

    function normalizeUser(rawUser, fallbackEmail = "", fallbackName = "") {
        const user = rawUser || {};
        const username =
            user.username ||
            user.userName ||
            fallbackName ||
            (user.email || fallbackEmail).split("@")[0] ||
            "Użytkownik";
        const isFieldAdmin = Boolean(user.fieldadmin || user.isAdmin);

        return {
            id: user.userid ?? user.id ?? null,
            userid: user.userid ?? user.id ?? null,
            username,
            name: username,
            email: user.email || fallbackEmail,
            fieldadmin: isFieldAdmin,
            isAdmin: isFieldAdmin,
            role: isFieldAdmin ? "admin" : "user",
        };
    }

    function getSession() {
        try {
            const raw =
                localStorage.getItem(SESSION_KEY) ||
                sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.token) return null;
            parsed.user = normalizeUser(parsed.user);
            return parsed;
        } catch {
            return null;
        }
    }

    function saveSession(token, rawUser, remember = true) {
        const sessionObj = {
            token,
            user: normalizeUser(rawUser),
            savedAt: Date.now(),
        };
        const serialized = JSON.stringify(sessionObj);

        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);

        if (remember) {
            localStorage.setItem(SESSION_KEY, serialized);
        } else {
            sessionStorage.setItem(SESSION_KEY, serialized);
        }
        return sessionObj;
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
    }

    async function postAuthEndpoint(endpointName, payload) {
        const candidates = [
            `${API_BASE_URL}/auth/${endpointName}`,
            `${API_BASE_URL}/${endpointName}`,
        ];

        let lastError = null;

        for (const url of candidates) {
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (res.status === 404) continue;

                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(
                        data.detail ||
                            data.msg ||
                            `Błąd serwera (${res.status})`,
                    );
                }
                return data;
            } catch (err) {
                lastError = err;
                if (
                    err instanceof TypeError &&
                    err.message.toLowerCase().includes("fetch")
                ) {
                    throw new Error(
                        "Brak połączenia z backendem FastAPI (http://127.0.0.1:8000). Sprawdź czy kontener Docker działa.",
                    );
                }
                if (err.message && !err.message.includes("404")) {
                    throw err;
                }
            }
        }

        throw lastError || new Error("Nie znaleziono endpointu autoryzacji.");
    }

    async function fetchProfile(token) {
        const candidates = [`${API_BASE_URL}/auth/me`, `${API_BASE_URL}/me`];

        for (const url of candidates) {
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        token: token,
                    },
                });
                if (res.ok) {
                    return await res.json();
                }
            } catch {
                /* ignoruj */
            }
        }
        return null;
    }

    async function login({ email, password, remember = true }) {
        const data = await postAuthEndpoint("login", {
            email: email.trim(),
            password,
        });

        const token = data.access_token;
        if (!token) {
            throw new Error("Serwer nie zwrócił tokenu dostępu.");
        }

        let userProfile = data.user || (await fetchProfile(token));
        if (!userProfile) {
            userProfile = { email: email.trim() };
        }

        return saveSession(token, userProfile, remember);
    }

    async function register({ userName, username, email, password }) {
        const cleanUsername = (userName || username || "").trim();
        const cleanEmail = email.trim();

        const data = await postAuthEndpoint("register", {
            username: cleanUsername,
            email: cleanEmail,
            password,
        });

        if (data.access_token) {
            const userProfile = data.user || {
                username: cleanUsername,
                email: cleanEmail,
                fieldadmin: false,
            };
            return saveSession(data.access_token, userProfile, true);
        }

        return await login({
            email: cleanEmail,
            password,
            remember: true,
        });
    }

    function logout(redirectUrl = "index.html") {
        clearSession();
        window.location.href = redirectUrl;
    }

    async function authFetch(path, options = {}) {
        const session = getSession();
        const headers = new Headers(options.headers || {});
        if (!headers.has("Content-Type") && options.body) {
            headers.set("Content-Type", "application/json");
        }
        if (session && session.token) {
            headers.set("Authorization", `Bearer ${session.token}`);
            headers.set("token", session.token);
        }

        const fullUrl = path.startsWith("http")
            ? path
            : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

        const res = await fetch(fullUrl, { ...options, headers });
        if (res.status === 401) {
            clearSession();
        }
        return res;
    }

    function applyPageGuardsAndUi() {
        const session = getSession();
        const body = document.body;

        if (body) {
            if (body.dataset.guestOnly === "true" && session) {
                window.location.replace("panel.html");
                return;
            }

            if (body.dataset.requireAuth === "true" && !session) {
                const current = encodeURIComponent(
                    window.location.pathname.split("/").pop() || "panel.html",
                );
                window.location.replace(`login.html?redirect=${current}`);
                return;
            }
        }

        document.querySelectorAll("[data-user-name]").forEach((el) => {
            if (session && session.user) {
                el.textContent = session.user.username;
            }
        });

        document.querySelectorAll("[data-logout-btn]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                logout("index.html");
            });
        });

        document.querySelectorAll("[data-auth-nav]").forEach((nav) => {
            if (!session) return;

            const adminBadge = session.user.fieldadmin
                ? ` <span style="font-size:0.72rem;padding:0.12rem 0.45rem;border-radius:999px;background:#eef6ee;color:#15803d;border:1px solid #bfe3c2;">Admin</span>`
                : "";

            nav.innerHTML = `
                <a href="panel.html" class="nav-link">Moje działki</a>
                <a href="wyszukiwarka.html" class="nav-link">Wyszukiwarka działek</a>
                <span class="nav-link" style="font-weight:600;cursor:default;">
                    ${session.user.username}${adminBadge}
                </span>
                <button type="button" id="navLogoutBtn" class="btn btn-primary btn-sm">
                    Wyloguj
                </button>
            `;

            document
                .getElementById("navLogoutBtn")
                ?.addEventListener("click", () => logout("index.html"));
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyPageGuardsAndUi);
    } else {
        applyPageGuardsAndUi();
    }

    window.PerunAuth = {
        API_BASE_URL,
        getSession,
        saveSession,
        clearSession,
        login,
        register,
        logout,
        authFetch,
    };
})();
