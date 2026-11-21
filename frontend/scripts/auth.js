(function () {
    "use strict";

    const CONFIG = {
        /* Zmień na false po podpięciu własnego backendu (np. FastAPI / Node / PHP) */
        useMockBackend: true,
        apiBaseUrl: "/api/auth",
        sessionCookieName: "perun_session",
        mockUsersKey: "perun_mock_users",
        defaultRedirectAfterLogin: "panel.html",
        loginPage: "login.html",
        landingPage: "index.html",
        rememberDays: 7,
        sessionHours: 12,
    };

    /* --- OBSŁUGA CIASTECZEK (HTTP COOKIES) --- */
    function setCookie(name, value, maxAgeSeconds) {
        let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;

        if (typeof maxAgeSeconds === "number" && maxAgeSeconds > 0) {
            cookieStr += `; max-age=${Math.floor(maxAgeSeconds)}`;
        }

        if (window.location.protocol === "https:") {
            cookieStr += "; Secure";
        }

        document.cookie = cookieStr;
    }

    function getCookie(name) {
        const encodedName = encodeURIComponent(name) + "=";
        const cookies = document.cookie ? document.cookie.split("; ") : [];

        for (let i = 0; i < cookies.length; i++) {
            if (cookies[i].startsWith(encodedName)) {
                return decodeURIComponent(
                    cookies[i].substring(encodedName.length),
                );
            }
        }
        return null;
    }

    function deleteCookie(name) {
        document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    }

    /* --- KONTO TESTOWE (TRYB MOCK) --- */
    function ensureDemoUser() {
        if (!CONFIG.useMockBackend) return;
        const users = getMockUsers();
        const demoEmail = "rolnik@perun.pl";
        if (!users.some((u) => u.email.toLowerCase() === demoEmail)) {
            users.push({
                id: "usr_demo_01",
                fullName: "Jan Kowalski",
                farmName: "Gospodarstwo Rolne Kowalski",
                email: demoEmail,
                passwordHash: simpleHash("Perun2026!"),
                createdAt: new Date().toISOString(),
            });
            localStorage.setItem(CONFIG.mockUsersKey, JSON.stringify(users));
        }
    }

    function getMockUsers() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.mockUsersKey)) || [];
        } catch {
            return [];
        }
    }

    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return "h_" + Math.abs(hash).toString(16);
    }

    /* --- ZARZĄDZANIE SESJĄ W CIASTECZKU --- */
    function saveSession(sessionData, remember) {
        clearSession();

        const ttlSeconds = remember
            ? CONFIG.rememberDays * 24 * 60 * 60
            : CONFIG.sessionHours * 60 * 60;

        const payload = {
            token: sessionData.token,
            user: sessionData.user,
            remember: Boolean(remember),
            expiresAt: Date.now() + ttlSeconds * 1000,
        };

        /* remember = true -> ciasteczko trwałe (7 dni); false -> sesyjne (do zamknięcia przeglądarki) */
        setCookie(
            CONFIG.sessionCookieName,
            JSON.stringify(payload),
            remember ? ttlSeconds : undefined,
        );

        if (!getCookie(CONFIG.sessionCookieName)) {
            throw new Error(
                "Przeglądarka zablokowała zapis ciasteczka sesji. Uruchom projekt przez serwer lokalny (np. http://localhost), a nie bezpośrednio z dysku (file://).",
            );
        }

        return payload;
    }

    function getSession() {
        const raw = getCookie(CONFIG.sessionCookieName);
        if (!raw) return null;

        try {
            const session = JSON.parse(raw);
            if (!session || !session.token || !session.user) {
                clearSession();
                return null;
            }
            if (session.expiresAt && Date.now() > session.expiresAt) {
                clearSession();
                return null;
            }
            return session;
        } catch {
            clearSession();
            return null;
        }
    }

    function clearSession() {
        deleteCookie(CONFIG.sessionCookieName);
    }

    function isAuthenticated() {
        return getSession() !== null;
    }

    /* --- LOGOWANIE --- */
    async function login({ email, password, remember }) {
        const normalizedEmail = email.trim().toLowerCase();

        if (CONFIG.useMockBackend) {
            await delay(200);
            const users = getMockUsers();
            const found = users.find(
                (u) => u.email.toLowerCase() === normalizedEmail,
            );

            if (!found || found.passwordHash !== simpleHash(password)) {
                throw new Error("Nieprawidłowy adres e-mail lub hasło.");
            }

            return saveSession(
                {
                    token: "perun_tok_" + cryptoRandomId(),
                    user: {
                        id: found.id,
                        fullName: found.fullName,
                        farmName: found.farmName,
                        email: found.email,
                    },
                },
                remember,
            );
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                email: normalizedEmail,
                password,
                remember,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.detail || data.message || "Błąd logowania.");
        }

        return saveSession(
            {
                token: data.access_token || data.token || "cookie_auth",
                user: data.user,
            },
            remember,
        );
    }

    /* --- REJESTRACJA --- */
    async function register({ fullName, farmName, email, password }) {
        const normalizedEmail = email.trim().toLowerCase();

        if (CONFIG.useMockBackend) {
            await delay(250);
            const users = getMockUsers();

            if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
                throw new Error(
                    "Konto z tym adresem e-mail już istnieje w systemie Perun.",
                );
            }

            const newUser = {
                id: "usr_" + cryptoRandomId(),
                fullName: fullName.trim(),
                farmName: farmName.trim() || "Moje gospodarstwo",
                email: normalizedEmail,
                passwordHash: simpleHash(password),
                createdAt: new Date().toISOString(),
            };

            users.push(newUser);
            localStorage.setItem(CONFIG.mockUsersKey, JSON.stringify(users));

            return saveSession(
                {
                    token: "perun_tok_" + cryptoRandomId(),
                    user: {
                        id: newUser.id,
                        fullName: newUser.fullName,
                        farmName: newUser.farmName,
                        email: newUser.email,
                    },
                },
                true,
            );
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                full_name: fullName.trim(),
                farm_name: farmName.trim(),
                email: normalizedEmail,
                password,
            }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                data.detail || data.message || "Nie udało się utworzyć konta.",
            );
        }

        return saveSession(
            {
                token: data.access_token || data.token || "cookie_auth",
                user: data.user,
            },
            true,
        );
    }

    /* --- WYLOGOWANIE --- */
    async function logout(redirectTo = CONFIG.landingPage) {
        if (!CONFIG.useMockBackend) {
            await fetch(`${CONFIG.apiBaseUrl}/logout`, {
                method: "POST",
                credentials: "include",
            }).catch(() => {});
        }
        clearSession();
        window.location.href = redirectTo;
    }

    /* --- HELPER DO ZAPYTAŃ API --- */
    async function authFetch(url, options = {}) {
        const session = getSession();
        const headers = new Headers(options.headers || {});
        if (session && session.token && session.token !== "cookie_auth") {
            headers.set("Authorization", `Bearer ${session.token}`);
        }
        const res = await fetch(url, {
            ...options,
            headers,
            credentials: "include",
        });
        if (res.status === 401) {
            clearSession();
            window.location.href = CONFIG.loginPage;
        }
        return res;
    }

    /* --- OCHRONA PODSTRON --- */
    let guardExecuted = false;

    function enforceRouteGuards() {
        if (guardExecuted || !document.body) return;
        guardExecuted = true;

        const requireAuth = document.body.dataset.requireAuth === "true";
        const guestOnly = document.body.dataset.guestOnly === "true";
        const session = getSession();

        if (requireAuth && !session) {
            document.documentElement.style.visibility = "hidden";
            const currentPath =
                window.location.pathname.split("/").pop() || "panel.html";
            const search = window.location.search || "";
            window.location.replace(
                `${CONFIG.loginPage}?redirect=${encodeURIComponent(currentPath + search)}`,
            );
            return;
        }

        if (guestOnly && session) {
            document.documentElement.style.visibility = "hidden";
            const params = new URLSearchParams(window.location.search);
            const target =
                params.get("redirect") || CONFIG.defaultRedirectAfterLogin;
            window.location.replace(target);
            return;
        }

        document.documentElement.style.visibility = "";
    }

    function initRouteGuardObserver() {
        if (document.body) {
            enforceRouteGuards();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.body) {
                observer.disconnect();
                enforceRouteGuards();
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }

    /* --- AKTUALIZACJA NAWIGACJI I DANYCH UŻYTKOWNIKA --- */
    function renderNavigationState() {
        const session = getSession();
        const navContainers = document.querySelectorAll("[data-auth-nav]");

        navContainers.forEach((nav) => {
            if (session) {
                nav.innerHTML = `
                    <a href="wyszukiwarka.html" class="nav-link">Wyszukiwarka działek</a>
                    <a href="panel.html" class="nav-link">Panel gospodarstwa</a>
                    <span class="user-session-badge" title="${escapeHtml(session.user.email)}">
                        <span class="user-session-dot"></span>
                        ${escapeHtml(session.user.fullName)}
                    </span>
                    <button type="button" class="btn-logout" data-logout-btn>Wyloguj</button>
                `;
            } else {
                nav.innerHTML = `
                    <a href="wyszukiwarka.html" class="nav-link">Wyszukiwarka działek</a>
                    <a href="register.html" class="nav-link">Rejestracja</a>
                    <a href="login.html" class="btn btn-primary btn-sm">Zaloguj się</a>
                `;
            }
        });

        if (session) {
            document.querySelectorAll("[data-user-name]").forEach((el) => {
                el.textContent = session.user.fullName;
            });
            document.querySelectorAll("[data-user-email]").forEach((el) => {
                el.textContent = session.user.email;
            });
            document.querySelectorAll("[data-user-farm]").forEach((el) => {
                el.textContent = session.user.farmName || "Moje gospodarstwo";
            });
        }

        document.querySelectorAll("[data-logout-btn]").forEach((btn) => {
            btn.addEventListener("click", () => logout(CONFIG.landingPage));
        });
    }

    function startCookieWatcher() {
        let lastAuthState = isAuthenticated();
        setInterval(() => {
            const currentAuthState = isAuthenticated();
            if (lastAuthState && !currentAuthState) {
                if (
                    document.body &&
                    document.body.dataset.requireAuth === "true"
                ) {
                    window.location.replace(CONFIG.loginPage);
                } else {
                    window.location.reload();
                }
            }
            lastAuthState = currentAuthState;
        }, 1500);
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function cryptoRandomId() {
        return (
            Math.random().toString(36).substring(2, 10) +
            Date.now().toString(36)
        );
    }

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    ensureDemoUser();
    initRouteGuardObserver();

    document.addEventListener("DOMContentLoaded", () => {
        enforceRouteGuards();
        renderNavigationState();
        startCookieWatcher();
    });

    window.PerunAuth = {
        login,
        register,
        logout,
        getSession,
        isAuthenticated,
        authFetch,
        getCookie,
        setCookie,
        deleteCookie,
    };
})();
