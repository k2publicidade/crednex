import { PlanCatalog } from "./PlanCatalog";
import { returnsPrincipal, type Plan } from "./catalog";
import { AdminOverviewMetrics } from "./AdminOverviewMetrics";
import { Participants } from "./Participants";
import { SupportPanel } from "./SupportPanel";
import { DEFAULT_SUPPORT } from "./support";
import { MIN_PASSWORD_LENGTH } from "./security";
import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  ShieldCheck,
  Headphones,
  LogOut,
  Menu,
  X,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  Diamond,
  LockKeyhole,
  Settings,
  History,
  Ticket,
  UserRound,
  Gift,
  ChevronRight,
  ChartNoAxesCombined,
  Landmark,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  ApiClient,
  loadSession,
  saveSession,
  clearSession,
  type Session,
} from "./api";
import {
  RANKS,
  DAY,
  planName,
  activePlanLimit,
  projectedReturn,
  remainingDays,
  amount,
  rankFor,
  fee,
  withdrawalOpen,
  type Rules,
} from "./rules";
import "./styles.css";
import "./mobile.css";
import "./withdrawal-alert.css";
import { Roulette } from "./Roulette";
import { PhoneAuth } from "./PhoneAuth";

type Row = Record<string, any>;
const money = (cents: number = 0) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
const labels: Record<string, string> = {
  ACTIVE: "Ativo",
  CLOSED: "Encerrado",
  OPEN: "Aberto",
  BLOCKED: "Bloqueado",
  PENDING: "Pendente",
  PAID: "Pago",
  REJECTED: "Recusado",
  AVAILABLE: "Disponível",
  USED: "Utilizado",
  CREATING: "Gerando cobrança",
  REVIEW_REQUIRED: "Requer conferência",
};
const walletName: Record<string, string> = {
  deposit: "Carteira de Saldo",
  earnings: "Carteira de Rendimentos",
  locked: "Rendimento em ciclo (travado)",
  commission: "Carteira de Indicações",
  vault: "Capital no Credcofre",
};
const personName = (u: Row) => {
  const name = typeof u?.name === "string" ? u.name.trim() : "";
  if (name && name !== "Participante") return name;
  return u?.phone || u?.email || "@" + u?.username;
};
const nav = [
  ["overview", "Visão geral", LayoutDashboard],
  ["plans", "Planos CREDNEX", ChartNoAxesCombined],
  ["vault", "Credcofre", Landmark],
  ["wallet", "Minha carteira", Wallet],
  ["network", "Minha rede", Users],
  ["salary", "Salário mensal", Diamond],
  ["roulette", "Roleta da sorte", Gift],
  ["support", "Atendimento", Headphones],
  ["profile", "Meu perfil", UserRound],
] as const;
const adminNav = [
  ["overview", "Visão da operação", LayoutDashboard],
  ["users", "Participantes", Users],
  ["contracts", "Aplicações", ChartNoAxesCombined],
  ["deposits", "Depósitos PIX", ArrowDownLeft],
  ["withdrawals", "Solicitações de saque", ArrowUpRight],
  ["support", "Atendimento", Ticket],
  ["audit", "Auditoria", History],
  ["settings", "Regras e roleta", Settings],
  ["profile", "Meu perfil", UserRound],
] as const;
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src="/brand/crednex.jpeg" alt="" />
      </span>
      <div>
        Cred<span>NEX</span>
        <small>SOLUÇÕES FINANCEIRAS</small>
      </div>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      {value === "CANCELLED" ? "Cancelado" : labels[value] || value}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Diamond size={26} />
      <p>{children}</p>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Form({
  children,
  onSubmit,
  button = "Confirmar",
  busy = false,
}: {
  children: ReactNode;
  onSubmit: (data: Row) => Promise<unknown>;
  button?: string;
  busy?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (pending || busy) return;
        const data = Object.fromEntries(new FormData(e.currentTarget));
        setPending(true);
        try {
          await onSubmit(data);
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      <button className="primary" disabled={pending || busy}>
        {pending ? "Processando…" : button}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  required = true,
  min,
  step,
  max,
  maxLength,
  minLength,
  readOnly,
  pattern,
  title,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  min?: string | number;
  step?: string;
  max?: string | number;
  maxLength?: number;
  minLength?: number;
  readOnly?: boolean;
  pattern?: string;
  title?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
        maxLength={maxLength}
        minLength={minLength}
        step={step}
        readOnly={readOnly}
        pattern={pattern}
        title={title}
      />
    </label>
  );
}
function Table({ heads, children }: { heads: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:760px)").matches,
  );
  useEffect(() => {
    const mq = matchMedia("(max-width:760px)"),
      update = () => setMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [session, setSession] = useState<Session | null>(loadSession),
    [page, setPage] = useState(location.hash.slice(1) || "overview"),
    [data, setData] = useState<Row | null>(null),
    [adminData, setAdminData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState(""),
    [payment, setPayment] = useState<Row | null>(null),
    [register, setRegister] = useState(
      !new URLSearchParams(location.search).has("admin") &&
        new URLSearchParams(location.search).has("ref"),
    );
  const [creditRequestId, setCreditRequestId] = useState(""),
    [purchaseRequestId, setPurchaseRequestId] = useState("");
  const [legacyLogin, setLegacyLogin] = useState(
    new URLSearchParams(location.search).has("admin"),
  );
  const logout = () => {
    clearSession();
    setSession(null);
    setData(null);
    setAdminData(null);
  };
  const api = new ApiClient(session?.token || null, logout),
    isAdmin =
      session?.user.role === "ADMIN_MASTER" ||
      session?.user.role === "ADMIN_VIEWER",
    isMaster = session?.user.role === "ADMIN_MASTER";
  const load = useCallback(async () => {
    if (!session) return;
    const client = new ApiClient(session.token, logout);
    try {
      const [state, admin] = await Promise.all([
        client.get<Row>("/state"),
        session.user.role === "ADMIN_MASTER" ||
        session.user.role === "ADMIN_VIEWER"
          ? client.get<Row>("/admin/state")
          : Promise.resolve(null),
      ]);
      setData(state);
      setAdminData(admin);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [session?.token]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const listener = () => setPage(location.hash.slice(1) || "overview");
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>(".modal");
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal("");
      if (e.key === "Tab") {
        const all = controls(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
  const navigate = (value: string) => {
    location.hash = value;
    setPage(value);
    setMenu(false);
    setError("");
    setNotice("");
  };
  const act = async (
    fn: () => Promise<unknown>,
    message = "Operação concluída",
  ) => {
    setError("");
    setNotice("");
    try {
      const result = await fn();
      setNotice(message);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copiado para a área de transferência");
    } catch {
      setError("Não foi possível copiar. Selecione e copie o texto exibido.");
    }
  };
  if (!session)
    return (
      <div className="auth">
        <section className="auth-story">
          <Brand />
          <div className="auth-heading">
            <span className="eyebrow">SEU PRÓXIMO CICLO COMEÇA AQUI</span>
            <h1>
              Novas possibilidades.
              <br />
              <em>Uma nova direção.</em>
            </h1>
            <p>Seus planos, sua rede e sua vida financeira em um só lugar.</p>
          </div>
          <div className="auth-art">
            <img src="/brand/crednex.jpeg" alt="Identidade visual CredNEX" />
          </div>
          <footer>
            <span>
              <ShieldCheck size={16} /> Acesso protegido
            </span>
            <span>CredNEX © {new Date().getFullYear()}</span>
          </footer>
        </section>
        <section className="auth-form">
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="eyebrow">PORTAL CREDNEX</span>
          <h2>
            {register
              ? "Comece sua jornada"
              : legacyLogin
                ? "Acesso administrativo"
                : "Bem-vindo de volta"}
          </h2>
          <p>
            {register
              ? "Crie sua conta com telefone e senha."
              : "Acesse sua conta e acompanhe seus resultados."}
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          {register || !legacyLogin ? (
            <PhoneAuth
              key={String(register)}
              register={register}
              onSession={(s) => {
                saveSession(s);
                setSession(s);
                navigate("overview");
              }}
            />
          ) : (
            <Form
              button="Entrar na plataforma"
              onSubmit={async (values) => {
                await act(async () => {
                  const s = await api.post<Session>("/auth/login", values);
                  saveSession(s);
                  setSession(s);
                  navigate("overview");
                }, "");
              }}
            >
              <Field label="Usuário" name="username" />
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
            </Form>
          )}
          {!register && (
            <button
              className="text-btn"
              onClick={() => {
                setLegacyLogin(!legacyLogin);
                setError("");
                setNotice("");
              }}
            >
              {legacyLogin
                ? "Voltar ao acesso de participantes"
                : "Acesso administrativo — usuário e senha"}
            </button>
          )}
          <button
            className="text-btn"
            onClick={() => {
              setRegister(!register);
              setLegacyLogin(false);
              setError("");
              setNotice("");
            }}
          >
            {register
              ? "Já tenho conta. Entrar"
              : "Ainda não tem conta? Cadastre-se"}
            <ArrowUpRight size={15} />
          </button>
          <div className="auth-help">
            <Headphones size={18} />
            <span>
              Atendimento
              <br />
              <small>
                Segunda a sexta: 12h às 18h
                <br />
                Sábado e domingo: 12h às 15h
              </small>
            </span>
          </div>
        </section>
      </div>
    );
  if (!data)
    return (
      <div className="loading">
        <Brand />
        <p role="status">Conectando à sua conta…</p>
        {error && <p role="alert">{error}</p>}
        <button onClick={() => void load()}>Tentar novamente</button>
        <button onClick={logout}>Sair</button>
      </div>
    );
  const plans: Plan[] = data.plans ?? [];
  const balances = data.balances,
    contracts: Row[] = data.contracts,
    members: Row[] = data.network,
    scope = members.filter(
      (m) => data.rules.salaryScope === "network" || m.level === 1,
    ),
    active = scope.filter((m) => m.active).length,
    rank = rankFor(active, scope.length),
    spins = data.spins.filter((s: Row) => s.status === "AVAILABLE").length;
  const items = isAdmin ? adminNav : nav,
    title = items.find((n) => n[0] === page)?.[1] || "Visão geral";
  const open = (kind: string, id = "") => {
    setSelected(id);
    if (kind === "addBalance") setCreditRequestId(crypto.randomUUID());
    if (kind === "contract") setPurchaseRequestId(crypto.randomUUID());
    setModal(kind);
    setError("");
  };
  const planUsage = (planId: string) =>
    contracts.filter((c) => c.planId === planId && c.status === "ACTIVE")
      .length;
  const contractTable = (rows: Row[]) => (
    <>
      {rows.length ? (
        <Table
          heads={[
            "Plano",
            "Aplicação",
            "Rendimento / dia",
            "Progresso e prazo",
            "Retorno estimado",
            "Situação",
          ]}
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.planName || planName(c.planId)}</strong>
                <small>{date(c.startedAt)}</small>
              </td>
              <td>{money(c.principal)}</td>
              <td>
                {money(Math.floor((c.principal * c.bps) / 10000))}
                <small>{(c.bps / 100).toLocaleString("pt-BR")}% ao dia</small>
              </td>
              <td>
                {c.paidDays} / {c.days || "∞"} dias
                <small>
                  {c.days
                    ? `${c.status === "CLOSED" ? 0 : remainingDays(c.startedAt, c.days)} dias restantes`
                    : "Sem prazo fixo"}
                </small>
                {c.days > 0 && (
                  <small>
                    Fim:{" "}
                    {date(
                      new Date(
                        Date.parse(c.startedAt) + c.days * DAY,
                      ).toISOString(),
                    )}
                  </small>
                )}
                <cite className="progress">
                  <i
                    style={{
                      width: `${c.days ? Math.min(100, (c.paidDays / c.days) * 100) : 100}%`,
                    }}
                  />
                </cite>
              </td>
              <td>
                {c.days ? (
                  <>
                    <strong>
                      {money(
                        projectedReturn(
                          c.principal,
                          c.bps,
                          c.days,
                          c.returnPrincipal,
                        ).total,
                      )}
                    </strong>
                    <small>
                      Rendimentos:{" "}
                      {money(
                        projectedReturn(
                          c.principal,
                          c.bps,
                          c.days,
                          c.returnPrincipal,
                        ).earnings,
                      )}
                    </small>
                    <small>
                      Capital devolvido:{" "}
                      {money(c.returnPrincipal ? c.principal : 0)}
                    </small>
                    <small>Total do período, inclui créditos já pagos</small>
                  </>
                ) : (
                  <small>Prazo flexível · sem total final fixo</small>
                )}
              </td>
              <td>
                <Badge value={c.status} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>
          Você ainda não tem aplicações. Conheça os planos disponíveis.
        </Empty>
      )}
    </>
  );
  const ledgerTable = (rows: Row[]) => (
    <>
      {rows.length ? (
        <Table heads={["Movimentação", "Carteira", "Data", "Valor"]}>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.description}</td>
              <td>{walletName[e.wallet]}</td>
              <td>{date(e.at)}</td>
              <td className={e.cents > 0 ? "positive" : ""}>
                {e.cents > 0 ? "+" : ""}
                {money(e.cents)}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>As movimentações da sua conta aparecerão aqui.</Empty>
      )}
    </>
  );
  const support = (tickets: Row[]) => (
    <>
      <SupportPanel
        settings={
          (isAdmin ? adminData?.support : data.support) || DEFAULT_SUPPORT
        }
        admin={!!isMaster}
        save={(values) =>
          act(
            () => api.patch("/admin/support", values),
            "Grupo de suporte atualizado",
          )
        }
      />
      <div className="section-heading support-tickets-heading">
        <div>
          <h2>{isAdmin ? "Chamados dos participantes" : "Meus chamados"}</h2>
          <p>Registre e acompanhe suas solicitações por aqui.</p>
        </div>
        <button className="primary" onClick={() => open("ticket")}>
          Abrir chamado
          <ArrowRight size={16} />
        </button>
      </div>
      {tickets.filter((t) => t.status !== "CLOSED").length ? (
        <div className="ticket-list">
          {tickets
            .filter((t) => t.status !== "CLOSED")
            .map((t) => (
              <article className="panel" key={t.id}>
                <div className="section-heading">
                  <h3>{t.subject}</h3>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Badge value={t.status} />
                    {isMaster && (
                      <button
                        className="outline danger"
                        onClick={() => open("closeTicket", t.id)}
                      >
                        Encerrar chamado
                      </button>
                    )}
                  </span>
                </div>
                <small>
                  {date(t.at)} · {t.id.slice(0, 8)}
                </small>
                <div className="messages">
                  {t.messages.map((m: Row, i: number) => (
                    <p key={i}>
                      <strong>{m.author}</strong>
                      <span>{m.text}</span>
                      <small>{date(m.at)}</small>
                    </p>
                  ))}
                </div>
                {(!isAdmin || isMaster) && (
                  <Form
                    button="Enviar resposta"
                    onSubmit={async (values) => {
                      await act(
                        () =>
                          api.post(`/tickets/${t.id}/reply`, {
                            ...values,
                            close: values.close === "on",
                          }),
                        "Resposta enviada",
                      );
                    }}
                  >
                    <label>
                      Mensagem
                      <textarea name="message" required maxLength={5000} />
                    </label>
                    {isMaster && (
                      <label className="check">
                        <input type="checkbox" name="close" /> Encerrar chamado
                        após responder
                      </label>
                    )}
                  </Form>
                )}
              </article>
            ))}
        </div>
      ) : (
        <div className="panel">
          <Empty>
            Nenhum chamado aberto. Estamos por aqui quando precisar.
          </Empty>
        </div>
      )}
    </>
  );
  return (
    <div
      className={`app-shell ${isAdmin ? "admin-app" : "member-app"} page-${page}`}
    >
      <aside
        id="main-menu"
        inert={mobile && !menu}
        className={menu ? "sidebar visible" : "sidebar"}
      >
        <Brand />
        <button
          className="close-menu icon-btn"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <span className="nav-label">
          {isAdmin ? "CENTRAL MASTER" : "SEU ESPAÇO"}
        </span>
        <nav>
          {items.map(([key, label, Icon]) => (
            <a
              href={`#${key}`}
              onClick={() => navigate(key)}
              key={key}
              className={page === key ? "active" : ""}
              aria-current={page === key ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {page === key && <i />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure">
            <ShieldCheck size={20} />
            <span>
              Sua conta conectada<small>Ambiente CREDNEX</small>
            </span>
          </div>
          <button
            onClick={() =>
              void act(async () => {
                await api.post("/auth/logout", {});
                logout();
              }, "")
            }
          >
            <LogOut size={18} />
            Sair da conta
          </button>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-btn"
              aria-label="Abrir menu"
              aria-expanded={menu}
              aria-controls="main-menu"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>
              CREDNEX <ChevronRight size={13} /> <b>{title}</b>
            </span>
          </div>
          {!isAdmin && (
            <div className="app-brand">
              <Brand />
            </div>
          )}
          <div className="topbar-user">
            <span className="live-dot" />
            <small>{isAdmin ? "Administrador" : "Área do participante"}</small>
            <button
              className="avatar"
              aria-label="Abrir meu perfil"
              onClick={() => navigate("profile")}
            >
              {personName(data.user).slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {isAdmin ? "CONTROLE E GESTÃO" : "BEM-VINDO À SUA CREDNEX"}
              </span>
              <h1>
                {page === "overview"
                  ? `Olá, ${personName(data.user).split(" ")[0]}.`
                  : title}
              </h1>
              <p>
                {page === "overview"
                  ? "Acompanhe cada movimento. Planeje seu próximo passo."
                  : "Tudo o que você precisa, com clareza e controle."}
              </p>
            </div>
            <span className="today">
              {new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                timeZone: "America/Sao_Paulo",
              }).format(new Date())}
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="icon-btn"
                aria-label="Fechar erro"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              <Check size={17} />
              {notice}
              <button
                className="icon-btn"
                aria-label="Fechar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data.rules.confirmed &&
            ["overview", "plans", "vault", "settings"].includes(page) && (
              <div className="alert pending">
                <Settings size={18} />
                As definições operacionais estão em revisão. Novas aplicações
                serão liberadas após a configuração.
              </div>
            )}
          {page === "profile" && !isAdmin && (
            <section className="mobile-account">
              <div className="account-identity">
                <span className="account-avatar">
                  {personName(data.user).slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2>{personName(data.user)}</h2>
                  <span>
                    {data.user.phone ||
                      data.user.email ||
                      "@" + data.user.username}
                  </span>
                </div>
                <Diamond size={24} />
              </div>
              <div className="account-tier">
                <span>Seu nível</span>
                <strong>{rank?.name || "Sem nível"}</strong>
              </div>
              <div className="account-balances">
                <div>
                  <span>Rendimentos liberados</span>
                  <strong>{money(balances.earnings)}</strong>
                </div>
                <div>
                  <span>Rendimento em ciclo (liberado no encerramento)</span>
                  <strong>{money(balances.locked)}</strong>
                </div>
                <div>
                  <span>Lucro de indicação</span>
                  <strong>{money(balances.commission)}</strong>
                </div>
                <div>
                  <span>Saldo para aplicar</span>
                  <strong>{money(balances.deposit)}</strong>
                </div>
              </div>
              <div className="app-money-actions">
                <button onClick={() => open("deposit")}>
                  <ArrowDownLeft size={20} />
                  Depositar
                </button>
                <button onClick={() => open("withdraw")}>
                  <ArrowUpRight size={20} />
                  Sacar
                </button>
              </div>
            </section>
          )}
          {page === "profile" && (
            <div className="profile-grid">
              <div className="panel">
                <h2>Dados da conta</h2>
                <Form
                  onSubmit={async (values) => {
                    await act(
                      () => api.patch("/profile", values),
                      "Perfil atualizado",
                    );
                  }}
                  button="Salvar alterações"
                >
                  <Field
                    label="Nome completo"
                    name="name"
                    defaultValue={
                      data.user.name === "Participante" ? "" : data.user.name
                    }
                  />
                  <label>
                    {data.user.phone ? "Telefone" : "Usuário"}
                    <input
                      value={data.user.phone || data.user.username}
                      readOnly
                    />
                  </label>
                  {data.user.phone ? (
                    <Field
                      label="E-mail"
                      name="email"
                      type="email"
                      defaultValue={data.user.email}
                    />
                  ) : (
                    <label>
                      E-mail
                      <input value={data.user.email} readOnly />
                    </label>
                  )}
                  <Field
                    label="CPF para saques via PIX"
                    name="cpf"
                    defaultValue={data.user.cpf || ""}
                    required
                  />
                </Form>
              </div>
              <div className="panel">
                <h2>Segurança</h2>
                <p>Ao trocar a senha, todas as sessões serão encerradas.</p>
                <Form
                  onSubmit={async (values) => {
                    const result = await act(
                      () => api.patch("/profile", values),
                      "Senha alterada",
                    );
                    if (result) logout();
                  }}
                  button="Alterar senha"
                >
                  <Field
                    label="Senha atual"
                    name="currentPassword"
                    type="password"
                  />
                  <Field
                    label="Nova senha (mínimo de 8 caracteres)"
                    name="newPassword"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={128}
                  />
                </Form>
              </div>
            </div>
          )}
          {!data.rules.confirmed && (
            <div className="alert error" role="status">
              {isAdmin
                ? "Contratações desativadas: participantes com saldo não conseguem comprar. Ative as contratações em Regras e roleta."
                : "Compras de planos temporariamente pausadas pela administração. Seu saldo está preservado. Procure o atendimento."}
            </div>
          )}
          {!isAdmin && (
            <>
              {page === "overview" && (
                <>
                  <div className="mobile-home">
                    <div className="app-welcome">
                      <div>
                        <span>SEU ESPAÇO CREDNEX</span>
                        <h2>
                          Olá, {personName(data.user).split(" ")[0]}
                          <em>.</em>
                        </h2>
                      </div>
                      <button
                        onClick={() => navigate("salary")}
                        className="member-level"
                      >
                        <Diamond size={16} />
                        {rank?.name || "Sem nível"}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <section className="app-balance">
                      <div className="balance-label">
                        <span>Saldo total em conta</span>
                        <ShieldCheck size={17} />
                      </div>
                      <strong>
                        {money(
                          balances.deposit + balances.earnings + balances.vault,
                        )}
                      </strong>
                      <span className="balance-currency">
                        BRL · Suas carteiras em um só lugar
                      </span>
                      <div className="app-money-actions">
                        <button onClick={() => open("deposit")}>
                          <ArrowDownLeft size={22} />
                          Depositar
                        </button>
                        <button onClick={() => open("withdraw")}>
                          <ArrowUpRight size={22} />
                          Sacar
                        </button>
                      </div>
                    </section>
                    <nav className="app-shortcuts" aria-label="Acessos rápidos">
                      {(
                        [
                          ["wallet", "Extrato", History],
                          ["vault", "Credcofre", Landmark],
                          ["network", "Convidar", Users],
                          ["support", "Ajuda", Headphones],
                        ] as const
                      ).map(([key, label, Icon]) => (
                        <button key={key} onClick={() => navigate(key)}>
                          <span>
                            <Icon size={23} />
                          </span>
                          {label}
                        </button>
                      ))}
                    </nav>
                    <div className="app-benefits">
                      <button
                        className="spin-promo"
                        onClick={() => navigate("roulette")}
                      >
                        <span className="promo-tag">ROLETA DA SORTE</span>
                        <strong>
                          Um giro.
                          <br />
                          Novas possibilidades.
                        </strong>
                        <span className="promo-link">
                          {spins > 0
                            ? `${spins} ${spins === 1 ? "giro disponível" : "giros disponíveis"}`
                            : "Conheça os benefícios"}
                          <ArrowUpRight size={15} />
                        </span>
                        <div className="mini-wheel" aria-hidden="true">
                          <Gift size={21} />
                        </div>
                      </button>
                      <button
                        className="vault-promo"
                        onClick={() => navigate("vault")}
                      >
                        <Landmark size={27} />
                        <span>CREDCOFRE</span>
                        <strong>
                          Seu próximo
                          <br />
                          passo.
                        </strong>
                        <span className="promo-link">
                          Explorar
                          <ArrowUpRight size={15} />
                        </span>
                      </button>
                    </div>
                    <button
                      className="app-level-card"
                      onClick={() => navigate("salary")}
                    >
                      <div className="level-emblem">
                        <Diamond size={35} />
                      </div>
                      <span>
                        <small>SUA JORNADA</small>
                        <strong>{rank?.name || "Cada conexão conta."}</strong>
                        <small>
                          {active} participantes ativos · {members.length} na
                          sua rede
                        </small>
                      </span>
                      <ChevronRight size={20} />
                    </button>
                    <div className="mobile-section-title">
                      <h2>Suas carteiras</h2>
                      <button
                        className="text-btn"
                        onClick={() => navigate("wallet")}
                      >
                        Ver detalhes
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  <section className="overview-grid">
                    <div className="balance-hero">
                      <span className="eyebrow">SEU SALDO EM CONTA</span>
                      <h2>
                        {money(
                          balances.deposit + balances.earnings + balances.vault,
                        )}
                      </h2>
                      <p>Depósitos + rendimentos + Credcofre</p>
                      <div className="hero-actions">
                        <button
                          className="primary"
                          onClick={() => open("deposit")}
                        >
                          <ArrowDownLeft size={17} />
                          Depositar via PIX
                        </button>
                        <button
                          className="outline"
                          onClick={() => open("withdraw")}
                        >
                          <ArrowUpRight size={17} />
                          Solicitar saque
                        </button>
                      </div>
                      <div className="hero-bottom">
                        <span>
                          <LockKeyhole size={14} />
                          Você no controle dos seus movimentos
                        </span>
                        <span>BRL</span>
                      </div>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">
                        <Landmark size={30} />
                      </div>
                      <span className="eyebrow">CONHEÇA O CREDCOFRE</span>
                      <h2>
                        Seu dinheiro.
                        <br />
                        Um novo ritmo.
                      </h2>
                      <p>Consulte as condições e os planos disponíveis.</p>
                      <button
                        className="text-btn"
                        onClick={() => navigate("vault")}
                      >
                        Explorar Credcofre
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                  </section>
                  <section className="stats-grid">
                    <Stat
                      label="Saldo para aplicar"
                      value={money(balances.deposit)}
                      detail="Depósitos PIX confirmados"
                    />
                    <Stat
                      label="Rendimentos liberados"
                      value={money(balances.earnings)}
                      detail="Sacável na janela 12h–18h (seg–sex)"
                      accent
                    />
                    <Stat
                      label="Rendimento em ciclo"
                      value={money(balances.locked)}
                      detail="Investimento + Lucro liberados no encerramento"
                    />
                    <Stat
                      label="Lucro de indicação"
                      value={money(balances.commission)}
                      detail="Sacável durante o ciclo"
                    />
                    <Stat
                      label="Saldo Credcofre"
                      value={money(balances.vault)}
                      detail="Capital e rendimentos do cofre"
                    />
                    <Stat
                      label="Sua rede"
                      value={String(members.length).padStart(2, "0")}
                      detail={`${members.filter((m) => m.active).length} participantes ativos`}
                    />
                  </section>
                  <div className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Minhas aplicações</h2>
                        <p>Acompanhe o progresso dos seus planos.</p>
                      </div>
                      <button
                        className="text-btn"
                        onClick={() => navigate("plans")}
                      >
                        Explorar planos
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    {contractTable(contracts)}
                  </div>
                  <div className="bottom-grid">
                    <div className="panel">
                      <div className="section-heading">
                        <h2>Últimos movimentos</h2>
                        <button
                          className="text-btn"
                          onClick={() => navigate("wallet")}
                        >
                          Ver extrato
                        </button>
                      </div>
                      {ledgerTable(data.ledger.slice(0, 4))}
                    </div>
                    <div className="schedule">
                      <Headphones size={25} />
                      <h3>Conte com a gente.</h3>
                      <p>Atendimento próximo para acompanhar sua jornada.</p>
                      <dl>
                        <dt>Segunda a sexta</dt>
                        <dd>12h às 18h</dd>
                        <dt>Sábado e domingo</dt>
                        <dd>12h às 15h</dd>
                      </dl>
                      <button
                        className="outline"
                        onClick={() => navigate("support")}
                      >
                        Falar com suporte
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
              {page === "plans" && (
                <>
                  <div className="info-strip">
                    <RefreshCw size={20} />
                    <span>
                      Rendimentos simples sobre o valor aplicado, a cada 24
                      horas completas, todos os dias. O limite é por plano e por
                      participante. Ao atingir o limite, você poderá investir
                      novamente quando uma das aplicações encerrar.
                    </span>
                  </div>
                  {["cycle", "daily"].map((family) => (
                    <section key={family}>
                      <div className="section-heading">
                        <div>
                          <h2>
                            {family === "cycle"
                              ? "Planos por ciclo"
                              : "Rendimento diário"}
                          </h2>
                          <p>
                            {
                              "Consulte os valores, prazos e condições de cada plano abaixo."
                            }
                          </p>
                        </div>
                        <span className="pill">
                          {family === "cycle" ? "CREDNEX C" : "NEX"}
                        </span>
                      </div>
                      <div
                        className={`plans-grid ${family === "daily" ? "five" : ""}`}
                      >
                        {plans
                          .filter((p) => p.family === family)
                          .map((p, i) => (
                            <article
                              className={`plan-card ${i === 1 ? "featured" : ""}`}
                              key={p.id}
                            >
                              <div className="plan-top">
                                <Diamond size={24} />
                                <span>{String(i + 1).padStart(2, "0")}</span>
                              </div>
                              <h3>{p.name}</h3>
                              <div className="rate">
                                {(p.bps / 100).toLocaleString("pt-BR")}%
                                <small>ao dia</small>
                              </div>
                              <p>
                                {p.min === p.max
                                  ? money(p.min)
                                  : `${money(p.min)} a ${money(p.max)}`}
                              </p>
                              <ul>
                                <li>
                                  <Check size={15} />
                                  {p.days} dias de duração
                                </li>
                                <li>
                                  <Check size={15} />
                                  Crédito a cada 24 horas
                                </li>
                                <li>
                                  <Check size={15} />
                                  Acompanhamento no extrato
                                </li>
                                <li>
                                  <Check size={15} />
                                  Aplicações ativas: {planUsage(p.id)}/
                                  {activePlanLimit(data.rules, p.id)}
                                </li>
                              </ul>
                              <button
                                className={i === 1 ? "primary" : "outline"}
                                onClick={() => open("contract", p.id)}
                                disabled={
                                  !data.rules.confirmed ||
                                  planUsage(p.id) >=
                                    activePlanLimit(data.rules, p.id)
                                }
                              >
                                {planUsage(p.id) >=
                                activePlanLimit(data.rules, p.id)
                                  ? "Limite atingido"
                                  : "Escolher plano"}
                                <ArrowUpRight size={16} />
                              </button>
                            </article>
                          ))}
                      </div>
                    </section>
                  ))}
                  <div className="panel">
                    <h2>Histórico de aplicações</h2>
                    {contractTable(
                      contracts.filter(
                        (c) =>
                          (c.family ??
                            (c.planId === "CREDCOFRE" ? "vault" : "")) !==
                          "vault",
                      ),
                    )}
                  </div>
                </>
              )}
              {page === "vault" && (
                <>
                  <div className="info-strip">
                    O Credcofre mantém o capital aplicado até o resgate. Ganhos
                    são creditados na Carteira de Rendimentos; capital volta à
                    carteira de origem.
                  </div>
                  <div className="plans-grid">
                    {plans
                      .filter((p) => p.family === "vault")
                      .map((p) => (
                        <article className="plan-card" key={p.id}>
                          <Landmark size={32} />
                          <h3>{p.name}</h3>
                          <div className="rate">
                            {p.bps / 100}%<small>ao dia</small>
                          </div>
                          <p>
                            {money(p.min)} a {money(p.max)}
                          </p>
                          <p>
                            Aplicações ativas: {planUsage(p.id)}/
                            {activePlanLimit(data.rules, p.id)}
                          </p>
                          <button
                            className="primary"
                            onClick={() => open("contract", p.id)}
                            disabled={
                              !data.rules.confirmed ||
                              planUsage(p.id) >=
                                activePlanLimit(data.rules, p.id)
                            }
                          >
                            Aplicar neste plano
                          </button>
                        </article>
                      ))}
                  </div>
                  {!plans.some((p) => p.family === "vault") && (
                    <Empty>
                      Nenhum plano Credcofre disponível para novas compras.
                    </Empty>
                  )}
                  <div className="panel">
                    <h2>Suas aplicações no Credcofre</h2>
                    {contractTable(
                      contracts.filter(
                        (c) =>
                          (c.family ??
                            (c.planId === "CREDCOFRE" ? "vault" : "")) ===
                          "vault",
                      ),
                    )}
                    <div className="inline-actions">
                      {contracts
                        .filter(
                          (c) =>
                            (c.family ??
                              (c.planId === "CREDCOFRE" ? "vault" : "")) ===
                              "vault" && c.status === "ACTIVE",
                        )
                        .map((c) => (
                          <button
                            className="outline"
                            key={c.id}
                            onClick={() => open("redeem", c.id)}
                          >
                            Resgatar {money(c.principal)} ·{" "}
                            {c.planName || planName(c.planId)}
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              )}

              {page === "wallet" && (
                <>
                  <div className="stats-grid three">
                    {Object.entries(balances).map(([key, value]) => (
                      <Stat
                        key={key}
                        label={walletName[key]}
                        value={money(value as number)}
                        detail={
                          key === "deposit"
                            ? "Para aplicar em planos. Não permite saque."
                            : key === "earnings"
                              ? "Rendimentos liberados: sacáveis na janela 12h–18h (seg–sex)."
                              : key === "locked"
                                ? "Rendimento do ciclo em andamento. Liberado no encerramento junto do investimento."
                                : key === "commission"
                                  ? "Lucro de indicação, sacável durante o ciclo."
                                  : "Capital aplicado. Resgate para a carteira de origem."
                        }
                        accent={key === "earnings" || key === "commission"}
                      />
                    ))}
                  </div>
                  <div className="wallet-actions">
                    <button className="primary" onClick={() => open("deposit")}>
                      <ArrowDownLeft size={18} />
                      Novo depósito PIX
                    </button>
                    <button
                      className="outline"
                      onClick={() => open("withdraw")}
                    >
                      <ArrowUpRight size={18} />
                      Solicitar saque
                    </button>
                    <span>Taxa de saque: 10% · Horário de Brasília</span>
                  </div>
                  <div className="panel">
                    <h2>Extrato da conta</h2>
                    {ledgerTable(data.ledger)}
                  </div>
                  <div className="panel">
                    <h2>Depósitos PIX</h2>
                    {data.deposits.length ? (
                      <Table heads={["Data", "Valor", "Situação", "Pagamento"]}>
                        {[...data.deposits].reverse().map((d: Row) => (
                          <tr key={d.id}>
                            <td>{date(d.at)}</td>
                              <td>{money(d.cents)}<small>{walletName[d.wallet || "deposit"]}</small></td>
                            <td>
                              <Badge value={d.status} />
                            </td>
                            <td>
                              {d.status === "PENDING" && (
                                <button
                                  className="text-btn"
                                  onClick={() => {
                                    setPayment(d);
                                    open("payment");
                                  }}
                                >
                                  Exibir PIX
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>Nenhum depósito solicitado.</Empty>
                    )}
                  </div>
                  <div className="panel">
                    <h2>Solicitações de saque</h2>
                    {data.withdrawals.length ? (
                      <Table
                        heads={["Data", "Bruto", "Taxa", "Líquido", "Situação"]}
                      >
                        {[...data.withdrawals].reverse().map((w: Row) => (
                          <tr key={w.id}>
                            <td>
                              {date(w.at)}
                              <small>{walletName[w.wallet]}</small>
                            </td>
                            <td>{money(w.cents)}</td>
                            <td>{money(w.fee)}</td>
                            <td>{money(w.gatewayNet ?? w.net)}</td>
                            <td>
                              <Badge value={w.status} />
                              {w.reference && <small>{w.reference}</small>}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>Nenhum saque solicitado.</Empty>
                    )}
                  </div>
                </>
              )}
              {page === "network" && (
                <>
                  <div className="invite-banner">
                    <div>
                      <span className="eyebrow">CRESÇA COM A SUA REDE</span>
                      <h2>Uma conexão abre novas possibilidades.</h2>
                      <p>
                        Compartilhe seu convite para cadastrar novos
                        participantes.
                      </p>
                      <div className="invite-link">
                        <input
                          aria-label="Seu link de indicação"
                          readOnly
                          value={`${location.origin}/?ref=${data.user.inviteCode}`}
                        />
                        <button
                          aria-label="Copiar convite"
                          onClick={() =>
                            void copy(
                              `${location.origin}/?ref=${data.user.inviteCode}`,
                            )
                          }
                        >
                          <Copy size={19} />
                        </button>
                      </div>
                    </div>
                    <Users size={100} />
                  </div>
                  <div className="stats-grid three">
                    {[10, 3, 2].map((n, i) => (
                      <Stat
                        key={n}
                        label={`Nível ${i + 1}`}
                        value={`${n}%`}
                        detail={`${members.filter((m) => m.level === i + 1).length} participantes neste nível`}
                        accent={i === 0}
                      />
                    ))}
                  </div>
                  <div className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Sua rede de indicações</h2>
                        <p>
                          Comissões de 10%, 3% e 2% nos três níveis, para
                          beneficiários com pacote ativo. Depósito sem compra
                          não gera comissão sobre aplicações.
                        </p>
                      </div>
                      <span className="pill">
                        Comissão sobre{" "}
                        {data.rules.commissionBase === "deposit"
                          ? "aplicações"
                          : "rendimentos"}
                      </span>
                    </div>
                    {members.length ? (
                      <Table heads={["Participante", "Nível", "Plano vigente"]}>
                        {members.map((m) => (
                          <tr key={m.id}>
                            <td>
                              {m.name && m.name !== "Participante"
                                ? m.name
                                : m.phone || m.email || m.name}
                              <small>
                                {m.name && m.name !== "Participante"
                                  ? m.phone || m.email
                                  : ""}
                              </small>
                            </td>
                            <td>Nível {m.level}</td>
                            <td>
                              <Badge value={m.active ? "ACTIVE" : "PENDING"} />
                            </td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>
                        Compartilhe seu convite para começar sua rede.
                      </Empty>
                    )}
                  </div>
                </>
              )}
              {page === "salary" && (
                <>
                  <div className="rank-summary">
                    <Diamond size={42} />
                    <div>
                      <span className="eyebrow">SUA CONQUISTA ATUAL</span>
                      <h2>{rank?.name || "Seu caminho começa aqui"}</h2>
                      <p>
                        {active} ativos e {scope.length} indicados{" "}
                        {data.rules.salaryScope === "direct"
                          ? "diretos"
                          : "na rede"}{" "}
                        ·{" "}
                        {rank
                          ? money(rank.cents) + "/mês"
                          : "Acompanhe os requisitos abaixo"}
                      </p>
                    </div>
                  </div>
                  <div className="ranks-grid">
                    {RANKS.map((r, i) => (
                      <article
                        className={`rank-card rank-${i} ${rank?.name === r.name ? "current" : ""}`}
                        key={r.name}
                      >
                        <Diamond size={32} />
                        <h3>{r.name}</h3>
                        <strong>
                          {money(r.cents)}
                          <small>/ mês</small>
                        </strong>
                        <p>
                          {r.active} ativos + {r.total} indicados
                        </p>
                        <label>
                          Ativos{" "}
                          <span>
                            {Math.min(active, r.active)}/{r.active}
                          </span>
                        </label>
                        <div className="progress">
                          <i
                            style={{
                              width: `${Math.min(100, (active / r.active) * 100)}%`,
                            }}
                          />
                        </div>
                        <label>
                          Indicados{" "}
                          <span>
                            {Math.min(scope.length, r.total)}/{r.total}
                          </span>
                        </label>
                        <div className="progress">
                          <i
                            style={{
                              width: `${Math.min(100, (scope.length / r.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="info-strip">
                    <ShieldCheck size={20} />
                    Um pagamento mensal pela maior faixa elegível no momento do
                    processamento. O crédito fica registrado no extrato.
                  </div>
                </>
              )}
              {page === "roulette" && (
                <div className="roulette-layout premium-roulette">
                  <Roulette
                    prizes={data.rules.prizes}
                    spins={spins}
                    draw={() =>
                      api.post<{ prize: Rules["prizes"][number] }>(
                        "/spins/draw",
                        {},
                      )
                    }
                    refresh={load}
                  />
                  <div className="panel full">
                    <h2>Seus giros</h2>
                    {data.spins.length ? (
                      <Table heads={["Data", "Situação", "Resultado"]}>
                        {data.spins.map((s: Row) => (
                          <tr key={s.id}>
                            <td>{date(s.at)}</td>
                            <td>
                              <Badge value={s.status} />
                            </td>
                            <td>
                              {s.prize?.label ||
                                (s.status === "CANCELLED"
                                  ? "Fora das regras de elegibilidade"
                                  : "Aguardando giro")}
                            </td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>Seus benefícios aparecerão aqui.</Empty>
                    )}
                  </div>
                </div>
              )}
              {page === "support" && support(data.tickets)}
            </>
          )}
          {isAdmin && adminData && (
            <>
              {!isMaster && (
                <div className="alert pending" role="status">
                  <ShieldCheck size={18} />
                  Somente leitura: esta conta pode conferir as informações, mas
                  não editar.
                </div>
              )}
              {page === "overview" && (
                <>
                  <AdminOverviewMetrics data={adminData} />
                  <div className="admin-actions">
                    <div>
                      <h2>Processamento financeiro</h2>
                      <p>
                        O servidor processa os vencimentos automaticamente. A
                        execução manual também evita créditos duplicados.
                      </p>
                    </div>
                    {isMaster && (
                      <button
                        className="primary"
                        onClick={() =>
                          void act(
                            () => api.post("/admin/process", {}),
                            "Rendimentos e salários processados",
                          )
                        }
                      >
                        <RefreshCw size={18} />
                        Processar agora
                      </button>
                    )}
                  </div>
                  <div className="panel">
                    <h2>Movimentação da operação</h2>
                    {ledgerTable([...adminData.ledger].reverse().slice(0, 20))}
                  </div>
                </>
              )}
              {page === "users" && (
                <Participants
                  data={adminData}
                  readOnly={!isMaster}
                  manageContract={async (userId, id, body) => {
                    const path = `/admin/users/${userId}/contracts`;
                    const result = id
                      ? await api.patch(`${path}/${id}`, body)
                      : await api.post(path, body);
                    await load();
                    setNotice(
                      "Aplicação atualizada. Alteração registrada na auditoria.",
                    );
                    return result;
                  }}
                  save={(id, values) =>
                    act(
                      () => api.patch(`/admin/users/${id}`, values),
                      "Cadastro atualizado",
                    )
                  }
                  resetPassword={(id, values) =>
                    act(
                      () => api.post(`/admin/users/${id}/password`, values),
                      "Senha redefinida. O participante deve entrar com a nova senha.",
                    )
                  }
                  open={open}
                  contractsTable={contractTable}
                  ledgerTable={ledgerTable}
                />
              )}

              {page === "contracts" && (
                <>
                  <PlanCatalog
                    plans={adminData.plans}
                    rules={adminData.rules}
                    readOnly={!isMaster}
                    save={async (body, id) => {
                      if (id) await api.patch(`/admin/plans/${id}`, body);
                      else await api.post("/admin/plans", body);
                      await load();
                      setNotice(
                        "Plano salvo. O catálogo dos participantes foi atualizado.",
                      );
                    }}
                  />
                  <div className="panel">
                    <h2>Contratos dos participantes</h2>
                    {adminData.contracts.length ? (
                      contractTable(adminData.contracts)
                    ) : (
                      <Empty>
                        Nenhum participante contratou um plano ainda. Os planos
                        disponíveis estão no catálogo acima.
                      </Empty>
                    )}
                  </div>
                </>
              )}
              {page === "deposits" && (
                <div className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Cobranças PIX</h2>
                      <p>
                        Aprove após conferir o recebimento. O valor será
                        creditado na carteira escolhida pelo participante.
                      </p>
                    </div>
                    {isMaster && (
                      <button
                        className="primary"
                        onClick={() => open("addBalance")}
                      >
                        Adicionar saldo
                        <ArrowDownLeft size={18} />
                      </button>
                    )}
                  </div>
                  {adminData.deposits.length ? (
                    <Table
                      heads={[
                        "Participante",
                        "Valor",
                        "Data",
                        "Situação",
                        "Identificador gateway",
                        "Ação",
                      ]}
                    >
                      {adminData.deposits.map((d: Row) => (
                        <tr key={d.id}>
                          <td>
                            {adminData.users.find((u: Row) => u.id === d.userId)
                              ?.name ||
                              `Conta excluída (${d.userId.slice(0, 8)})`}
                          </td>
                          <td>{money(d.cents)}<small>{walletName[d.wallet || "deposit"]}</small></td>
                          <td>{date(d.at)}</td>
                          <td>
                            <Badge value={d.status} />
                          </td>
                          <td>{d.providerId || "Aguardando conciliação"}</td>
                          <td>
                            {isMaster &&
                              ["PENDING", "REVIEW_REQUIRED"].includes(
                                d.status,
                              ) && (
                                <button
                                  className="outline"
                                  onClick={() => open("approveDeposit", d.id)}
                                >
                                  Aprovar depósito
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <Empty>Nenhuma cobrança solicitada.</Empty>
                  )}
                </div>
              )}

              {page === "withdrawals" && (
                <div className="panel">
                  <h2>Fila de saques</h2>
                  <p>
                    Analise e envie o PIX pela 2PP. A confirmação do gateway
                    conclui o pagamento. Tarifas adicionais são descontadas do
                    participante.
                  </p>
                  {adminData.withdrawals.length ? (
                    <Table
                      heads={[
                        "Participante / chave PIX",
                        "Bruto",
                        "Taxa",
                        "Líquido",
                        "Situação",
                        "Ação",
                      ]}
                    >
                      {adminData.withdrawals.map((w: Row) => (
                        <tr key={w.id}>
                          <td>
                            {adminData.users.find((u: Row) => u.id === w.userId)
                              ?.name ||
                              `Conta excluída (${w.userId.slice(0, 8)})`}
                            <small>{w.pixKey}</small>
                          </td>
                          <td>{money(w.cents)}</td>
                          <td>{money(w.fee)}</td>
                          <td>{money(w.gatewayNet ?? w.net)}</td>
                          <td>
                            <Badge value={w.status} />
                            {w.payoutState && (
                              <small>
                                {w.payoutState === "COMPLETED"
                                  ? "Confirmado pela 2PP"
                                  : w.payoutState === "FAILED"
                                    ? "Falhou e saldo devolvido"
                                    : w.payoutState === "REVIEW_REQUIRED"
                                      ? "Envio incerto: conferir na 2PP"
                                      : "Aguardando confirmação da 2PP"}
                              </small>
                            )}
                            {w.providerId && <small>{w.providerId}</small>}
                          </td>
                          <td>
                            {isMaster &&
                              w.status === "PENDING" &&
                              !w.payoutState && (
                                <button
                                  className="outline"
                                  onClick={() => open("settle", w.id)}
                                >
                                  Analisar
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <Empty>Nenhum saque na fila.</Empty>
                  )}
                </div>
              )}
              {page === "support" && support(adminData.tickets)}
              {page === "audit" && (
                <div className="panel">
                  <h2>Trilha de auditoria</h2>
                  <Table heads={["Data", "Ação", "Responsável", "Detalhes"]}>
                    {[...adminData.audit].reverse().map((a: Row) => (
                      <tr key={a.id}>
                        <td>{date(a.at)}</td>
                        <td>{a.action}</td>
                        <td>
                          {adminData.users.find((u: Row) => u.id === a.actor)
                            ?.name || a.actor}
                        </td>
                        <td>
                          <code>{JSON.stringify(a.details)}</code>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
              {page === "settings" && (
                <RulesEditor
                  plans={adminData.plans}
                  rules={adminData.rules}
                  readOnly={!isMaster}
                  save={async (rules) => {
                    await act(
                      () => api.patch("/admin/rules", rules),
                      "Configurações salvas",
                    );
                  }}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>CredNEX — Soluções Financeiras.</span>
            <span>Horários em Brasília · {new Date().getFullYear()}</span>
          </footer>
        </main>
      </div>
      {!isAdmin && (
        <nav className="app-bottom-nav" aria-label="Navegação principal">
          {(
            [
              ["overview", "Início", LayoutDashboard],
              ["plans", "Planos", ChartNoAxesCombined],
              ["roulette", "Girar", Gift],
              ["network", "Equipe", Users],
              ["profile", "Minha área", UserRound],
            ] as const
          ).map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#${key}`}
              onClick={() => navigate(key)}
              aria-current={page === key ? "page" : undefined}
              className={`${page === key ? "active " : ""}${key === "roulette" ? "nav-spin" : ""}`}
            >
              <span>
                <Icon size={22} />
                {key === "roulette" && spins > 0 && <i>{spins}</i>}
              </span>
              <small>{label}</small>
            </a>
          ))}
        </nav>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal("")}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              aria-label="Fechar janela"
              onClick={() => setModal("")}
            >
              <X />
            </button>
            <span className="eyebrow">CREDNEX</span>
            <h2 id="modal-title">
              {
                (
                  {
                    approveDeposit: "Aprovar depósito PIX",
                    addBalance: "Adicionar saldo",
                    deleteUser: "Excluir participante",
                    closeTicket: "Encerrar chamado",
                    deposit: "Depósito via PIX",
                    payment: "Pague com PIX",
                    contract: `Aplicar em ${plans.find((p) => p.id === selected)?.name || planName(selected)}`,
                    withdraw: "Solicitar saque",
                    redeem: "Resgatar Credcofre",
                    ticket: "Novo chamado",
                    settle: "Concluir solicitação",
                    prize: "Resultado do seu giro",
                  } as Row
                )[modal]
              }
            </h2>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {modal === "approveDeposit" && isMaster && (
              <Form
                button="Aprovar e creditar saldo"
                onSubmit={async (values) => {
                  const result = await act(
                    () =>
                      api.post(`/admin/deposits/${selected}/approve`, values),
                    "Depósito aprovado. Saldo creditado na carteira do participante.",
                  );
                  if (result) setModal("");
                }}
              >
                <p>
                  Participante:{" "}
                  <strong>
                    {
                      adminData?.users.find(
                        (u: Row) =>
                          u.id ===
                          adminData?.deposits.find(
                            (d: Row) => d.id === selected,
                          )?.userId,
                      )?.name
                    }
                  </strong>
                </p>
                <p>
                  Valor:{" "}
                  <strong>
                    {money(
                      adminData?.deposits.find((d: Row) => d.id === selected)
                        ?.cents,
                    )}
                  </strong>
                </p>
                <p>
                  Confirme o recebimento do PIX antes de aprovar. A operação
                  ficará registrada na auditoria.
                </p>
                <Field
                  label="Referência do comprovante / conferência"
                  name="reference"
                  maxLength={500}
                />
              </Form>
            )}
            {modal === "addBalance" && isMaster && (
              <Form
                button="Adicionar saldo ao participante"
                onSubmit={async (values) => {
                  const { userId, ...body } = values;
                  const result = await act(
                    () =>
                      api.post(`/admin/users/${userId}/balance`, {
                        ...body,
                        requestId: creditRequestId,
                      }),
                    "Saldo adicionado à carteira do participante.",
                  );
                  if (result) setModal("");
                }}
              >
                <p>
                  Escolha a carteira de destino do crédito administrativo. Para
                  uma cobrança PIX existente, utilize Aprovar depósito.
                </p>
                <label>
                  Participante
                  <select name="userId" required defaultValue={selected}>
                    <option value="" disabled>
                      Selecione um participante
                    </option>
                    {adminData?.users
                      .filter(
                        (u: Row) =>
                          u.role === "ASSOCIATE" && u.status === "ACTIVE",
                      )
                      .map((u: Row) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.username}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Creditar em
                  <select name="wallet" defaultValue="deposit">
                    <option value="deposit">Carteira de Saldo · para aplicar</option>
                    <option value="earnings">Carteira de Rendimentos · permite saque</option>
                  </select>
                </label>
                <Field
                  label="Valor (R$)"
                  name="amount"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                />
                <Field
                  label="Motivo do crédito"
                  name="reason"
                  maxLength={500}
                />
              </Form>
            )}
            {modal === "closeTicket" && isMaster && (
              <Form
                button="Encerrar chamado"
                onSubmit={async () => {
                  const result = await act(
                    () => api.post(`/tickets/${selected}/close`, {}),
                    "Chamado encerrado",
                  );
                  if (result) setModal("");
                }}
              >
                <p>
                  Encerrar este chamado agora? Ele sairá da lista de atendimento
                  e o participante verá como concluído.
                </p>
                <button
                  type="button"
                  className="outline"
                  onClick={() => setModal("")}
                >
                  Cancelar
                </button>
              </Form>
            )}
            {modal === "deleteUser" && isMaster && (
              <Form
                button="Excluir definitivamente"
                onSubmit={async () => {
                  const result = await act(
                    () => api.delete(`/admin/users/${selected}`),
                    "Conta excluída com sucesso",
                  );
                  if (result) setModal("");
                }}
              >
                <p>
                  Excluir a conta de{" "}
                  <strong>
                    {adminData?.users.find((u: Row) => u.id === selected)?.name}
                  </strong>{" "}
                  (
                  {
                    adminData?.users.find((u: Row) => u.id === selected)
                      ?.username
                  }
                  )? Esta ação é permanente e encerra todos os acessos da conta.
                </p>
                <p>
                  O histórico financeiro e de auditoria será preservado.
                  Indicados diretos ficarão sem patrocinador. Contas com saldo,
                  aplicações ativas ou pagamentos pendentes precisam resolver
                  essas pendências antes da exclusão.
                </p>
                <button
                  type="button"
                  className="outline"
                  onClick={() => setModal("")}
                >
                  Cancelar
                </button>
              </Form>
            )}
            {modal === "deposit" && (
              <Form
                button="Gerar cobrança PIX"
                onSubmit={async (values) => {
                  const result = await act(
                    () => api.post<Row>("/deposits", values),
                    "Cobrança gerada",
                  );
                  if (result) {
                    setPayment(result as Row);
                    setModal("payment");
                  }
                }}
              >
                <p>
                  Depósito mínimo de R$40. Escolha se o valor será usado para
                  aplicar ou ficará disponível na Carteira de Rendimentos.
                </p>
                <Field
                  label="Valor do depósito (R$)"
                  name="amount"
                  type="number"
                  min="40"
                  step="0.01"
                  defaultValue="40"
                />
                <label>
                  Creditar em
                  <select name="wallet" defaultValue="deposit">
                    <option value="deposit">Carteira de Saldo · para aplicar</option>
                    <option value="earnings">Carteira de Rendimentos · permite saque</option>
                  </select>
                </label>
                <Field label="CPF ou CNPJ do pagador" name="document" />
                {data.user.phone && !data.user.email && (
                  <>
                    <p>Para emitir o PIX, complete os dados do pagador.</p>
                    <Field
                      label="Nome completo do pagador"
                      name="customerName"
                      defaultValue={
                        data.user.name === "Participante" ? "" : data.user.name
                      }
                      maxLength={100}
                    />
                    <Field
                      label="E-mail do pagador"
                      name="customerEmail"
                      type="email"
                      maxLength={254}
                    />
                  </>
                )}
              </Form>
            )}
            {modal === "payment" && payment && (
              <div className="pix">
                <p>{money(payment.cents)}</p>
                <div className="qr">
                  <QRCodeSVG value={payment.qrCode} size={220} />
                </div>
                <label>
                  PIX copia e cola
                  <textarea readOnly value={payment.qrCode} />
                </label>
                <button
                  className="primary"
                  onClick={() => void copy(payment.qrCode)}
                >
                  Copiar código
                  <Copy size={17} />
                </button>
                <p>
                  Abra o aplicativo do seu banco e pague a cobrança. A
                  confirmação aparecerá na sua carteira.
                </p>
              </div>
            )}
            {modal === "contract" && (
              <InvestmentForm
                key={selected}
                plans={plans}
                planId={selected}
                rules={data.rules}
                active={planUsage(selected)}
                balances={balances}
                submit={async (values) => {
                  const result = await act(
                    () =>
                      api.post("/contracts", {
                        ...values,
                        planId: selected,
                        requestId: purchaseRequestId,
                      }),
                    "Aplicação contratada",
                  );
                  if (result) setModal("");
                }}
              />
            )}
            {modal === "withdraw" && (
              <WithdrawalForm
                canWithdraw={data.canWithdraw === true}
                available={data.withdrawalLimit ?? balances.earnings}
                cpf={data.user.cpf}
                onNeedCpf={() => {
                  setModal("");
                  navigate("profile");
                }}
                submit={async (values) => {
                  const result = await act(
                    () => api.post("/withdrawals", values),
                    "Saque solicitado",
                  );
                  if (result) setModal("");
                }}
              />
            )}
            {modal === "redeem" && (
              <>
                <p>
                  O saldo deixará de render e será transferido integralmente para
                  a Carteira de Rendimentos, onde ficará disponível para saque.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    void act(async () => {
                      await api.post("/vault/redeem", { contractId: selected });
                      setModal("");
                    }, "Capital resgatado")
                  }
                >
                  Confirmar resgate
                </button>
              </>
            )}
            {modal === "ticket" && (
              <Form
                button="Enviar chamado"
                onSubmit={async (values) => {
                  const result = await act(
                    () => api.post("/tickets", values),
                    "Chamado enviado",
                  );
                  if (result) setModal("");
                }}
              >
                <Field label="Assunto" name="subject" maxLength={200} />
                <label>
                  Como podemos ajudar?
                  <textarea name="message" required maxLength={5000} />
                </label>
              </Form>
            )}
            {modal === "settle" && (
              <>
                <Form
                  button="Enviar pagamento PIX pela 2PP"
                  onSubmit={async (values) => {
                    const result = await act(
                      () =>
                        api.post(`/admin/withdrawals/${selected}/pay`, values),
                      "Saque enviado à 2PP. Aguarde confirmação.",
                    );
                    if (result) setModal("");
                  }}
                >
                  <p>
                    O participante recebe o valor após a taxa CREDNEX de 10% e
                    as tarifas adicionais da 2PP. O pagamento será enviado
                    somente via PIX para o CPF cadastrado na conta do participante.
                  </p>
                  <p>
                    Chave cadastrada:{" "}
                    <strong>
                      {
                        adminData?.withdrawals.find(
                          (w: Row) => w.id === selected,
                        )?.pixKey
                      }
                    </strong>
                  </p>
                  <p>
                    O CPF do participante será validado novamente antes do envio.
                  </p>
                  <p className="alert pending">
                    O sistema usará exclusivamente o CPF cadastrado pelo participante.
                  </p>
                </Form>
                <Form
                  button="Recusar e devolver saldo"
                  onSubmit={async (values) => {
                    const result = await act(
                      () =>
                        api.post(`/admin/withdrawals/${selected}`, {
                          ...values,
                          status: "REJECTED",
                        }),
                      "Saque recusado",
                    );
                    if (result) setModal("");
                  }}
                >
                  <Field label="Motivo da recusa" name="reference" />
                </Form>
              </>
            )}
            {modal === "prize" && (
              <div className="prize-result">
                <Gift size={54} />
                <h3>{selected}</h3>
                <p>O resultado está registrado no histórico dos seus giros.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function WithdrawalForm({
  cpf,
  onNeedCpf,
  canWithdraw,
  available,
  submit,
}: {
  cpf?: string;
  onNeedCpf: () => void;
  canWithdraw: boolean;
  available: number;
  submit: (values: Row) => Promise<void>;
}) {
  const [value, setValue] = useState(""),
    cents = Math.round(Number(value) * 100) || 0;
  return (
    <Form
      button="Solicitar saque"
      busy={
        !canWithdraw ||
        !withdrawalOpen("earnings") ||
        cents < 4000 ||
        cents > available ||
        !cpf
      }
      onSubmit={(values) => submit({ ...values, wallet: "earnings" })}
    >
      <p>
        Disponível para saque: <strong>{money(available)}</strong>
        <br />
        <small>
          Soma de Rendimentos liberados e Lucro de indicação. Na janela 12h–18h
          (seg–sex), mínimo R$ 40,00 e taxa de 10%.
        </small>
      </p>
      {!canWithdraw && (
        <div className="alert error" role="status">
          Não há valor liberado para saque. O rendimento do ciclo fica travado e
          sai no encerramento (Investimento + Lucro). Durante o ciclo fica
          disponível o lucro de indicação.
        </div>
      )}
      <label>
        Valor bruto (R$)
        <input
          name="amount"
          type="number"
          min="40"
          max={available / 100}
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </label>
      <div className="alert pending" role="status">
        <strong>Saque somente via PIX CPF</strong>
        {cpf ? (
          <>
            <span>O valor será enviado exclusivamente para o CPF cadastrado nesta conta.</span>
            <input value={cpf} readOnly aria-label="CPF de recebimento PIX" />
          </>
        ) : (
          <>
            <span>Cadastre seu CPF para liberar saques.</span>
            <button type="button" className="outline" onClick={onNeedCpf}>Cadastrar CPF agora</button>
          </>
        )}
      </div>
      <div className="withdraw-summary">
        <p>
          Taxa de 10% <span>{money(fee(cents))}</span>
        </p>
      </div>
      <small>
        Segunda a sexta, das 12h às 18h.{" "}
        {withdrawalOpen("earnings")
          ? "Janela aberta."
          : "Janela fechada no momento."}
      </small>
    </Form>
  );
}

function RulesEditor({
  plans,
  rules,
  save,
  readOnly,
}: {
  plans: Plan[];
  rules: Rules;
  save: (r: Rules & { pauseConfirmation?: string }) => Promise<void>;
  readOnly?: boolean;
}) {
  const [prizes, setPrizes] = useState(rules.prizes),
    [principal, setPrincipal] = useState(rules.returnPrincipal),
    [purchasesEnabled, setPurchasesEnabled] = useState(rules.confirmed);
  return (
    <div className="panel rules-panel">
      <h2>Definições operacionais</h2>
      <p>
        As taxas e os prazos seguem os planos CREDNEX. Alterações na devolução
        de capital e na base de comissão valem para novas aplicações.
      </p>
      {readOnly ? (
        <p className="info-strip">
          Somente leitura: as definições operacionais estão disponíveis apenas
          para conferência.
        </p>
      ) : (
        <Form
          button="Salvar configurações"
          onSubmit={async (values) =>
            save({
              ...rules,
              confirmed: purchasesEnabled,
              pauseConfirmation: values.pauseConfirmation,
              returnPrincipal: principal,
              commissionBase: values.commissionBase,
              salaryScope: values.salaryScope,
              activePlanLimits: Object.fromEntries(
                plans.map((p) => [p.id, Number(values[`limit:${p.id}`])]),
              ),
              prizes,
            })
          }
        >
          <label className="check">
            <input
              type="checkbox"
              name="confirmed"
              checked={purchasesEnabled}
              onChange={(e) => setPurchasesEnabled(e.target.checked)}
            />{" "}
            Liberar novas aplicações com estas definições
          </label>
          {!purchasesEnabled && (
            <>
              <div className="alert error">
                Desativar esta opção impede todos os participantes de comprar
                planos, mesmo com saldo.
              </div>
              <Field
                label="Para pausar, digite PAUSAR COMPRAS"
                name="pauseConfirmation"
                pattern="PAUSAR COMPRAS"
              />
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={principal}
              onChange={(e) => setPrincipal(e.target.checked)}
            />{" "}
            Devolver o capital ao final dos planos NEX (50 dias)
          </label>
          <small>
            Nos planos Cred-c1, Cred-c2 e Cred-c3, a devolução de capital é
            sempre aplicada conforme a regra do ciclo (35 dias), com o
            Investimento + Lucro liberados no encerramento.
          </small>
          <label>
            Comissões de indicação sobre
            <select name="commissionBase" defaultValue={rules.commissionBase}>
              <option value="deposit">Valor da aplicação confirmada</option>
              <option value="earnings">Rendimento creditado</option>
            </select>
          </label>
          <label>
            Contagem para salário
            <select name="salaryScope" defaultValue={rules.salaryScope}>
              <option value="direct">Indicados diretos</option>
              <option value="network">Toda a rede</option>
            </select>
          </label>
          <div className="info-strip">
            Depósito mínimo: R$40 · Taxa de saque: 10% · Rendimento simples
          </div>
          <h3>Limite de aplicações ativas por plano</h3>
          <p>
            Por participante. Uma aplicação encerrada libera uma vaga. Reduzir o
            limite preserva aplicações existentes e impede novas contratações
            enquanto a quantidade ativa estiver no limite ou acima dele.
          </p>
          {plans.map((p) => (
            <Field
              key={p.id}
              label={`${p.name} · máximo simultâneo`}
              name={`limit:${p.id}`}
              type="number"
              min="1"
              step="1"
              defaultValue={activePlanLimit(rules, p.id)}
            />
          ))}
          <h3>Prêmios da roleta</h3>
          <p>
            Cada indicação direta e cada reinvestimento com saldo de rendimentos
            nos planos Ciclo ou Rendimento Diário libera um giro. CredCofre não
            gera giros.
          </p>
          <p>
            A chance de cada prêmio é seu peso dividido pela soma dos pesos.
            Valor zero representa um resultado sem crédito.
          </p>
          {prizes.map((p, i) => (
            <div className="prize-editor" key={i}>
              <label>
                Prêmio
                <input
                  required
                  value={p.label}
                  onChange={(e) =>
                    setPrizes(
                      prizes.map((p, n) =>
                        n === i ? { ...p, label: e.target.value } : p,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Valor em centavos
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={p.cents}
                  onChange={(e) =>
                    setPrizes(
                      prizes.map((p, n) =>
                        n === i ? { ...p, cents: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Peso
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={p.weight}
                  onChange={(e) =>
                    setPrizes(
                      prizes.map((p, n) =>
                        n === i ? { ...p, weight: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remover prêmio ${i + 1}`}
                onClick={() => setPrizes(prizes.filter((_, n) => n !== i))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            className="outline"
            type="button"
            onClick={() =>
              setPrizes([...prizes, { label: "", cents: 0, weight: 1 }])
            }
          >
            Adicionar prêmio
          </button>
        </Form>
      )}
    </div>
  );
}

function InvestmentForm({
  plans,
  planId,
  rules,
  active,
  balances,
  submit,
}: {
  plans: Plan[];
  planId: string;
  rules: Rules;
  active: number;
  balances: Row;
  submit: (values: Row) => Promise<void>;
}) {
  const plan = plans.find((p) => p.id === planId),
    [value, setValue] = useState(String((plan?.min ?? 0) / 100)),
    [wallet, setWallet] = useState("deposit");
  if (!plan)
    return (
      <p role="status">
        Este plano não está disponível para novas compras. Feche esta janela e
        consulte o catálogo atualizado.
      </p>
    );
  let cents = 0;
  try {
    cents = amount(value);
  } catch {}
  const limit = activePlanLimit(rules, planId),
    full = active >= limit,
    valid = cents >= plan.min && cents <= plan.max,
    projection = projectedReturn(
      cents,
      plan.bps,
      plan.days,
      returnsPrincipal(plan, rules),
    );
  return (
    <Form
      button={full ? "Limite atingido" : "Confirmar aplicação"}
      busy={full || !rules.confirmed || !valid || cents > balances[wallet]}
      onSubmit={submit}
    >
      {!rules.confirmed && (
        <div className="alert error" role="status">
          Novas compras estão pausadas pela administração. Seu saldo está
          preservado. Entre em contato com o atendimento.
        </div>
      )}
      <p>
        {(plan.bps / 100).toLocaleString("pt-BR")}% ao dia sobre o valor
        aplicado.{" "}
        {plan.days ? plan.days + " dias de duração." : "Resgate flexível."}
      </p>
      <div className="info-strip" role="status">
        Aplicações ativas em {plan.name}:{" "}
        <strong>
          {active}/{limit}
        </strong>
      </div>
      <small>
        {plan.days
          ? "Ao atingir o limite, aguarde uma aplicação finalizar seu ciclo para investir novamente neste plano."
          : "Ao atingir o limite, resgate uma aplicação do Credcofre para liberar uma vaga."}
      </small>
      <label>
        Valor da aplicação (R$)
        <input
          name="amount"
          type="number"
          min={plan.min / 100}
          max={plan.max / 100}
          step="0.01"
          value={value}
          readOnly={plan.min === plan.max}
          required
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {valid ? (
        <div className="withdraw-summary" aria-live="polite">
          <p>
            Rendimento por dia <strong>{money(projection.daily)}</strong>
          </p>
          {plan.days > 0 && (
            <>
              <p>
                Rendimentos em {plan.days} dias{" "}
                <span>{money(projection.earnings)}</span>
              </p>
              <p>
                Capital devolvido ao final{" "}
                <span>{money(projection.capital)}</span>
              </p>
              <p>
                Total estimado do período{" "}
                <strong>{money(projection.total)}</strong>
              </p>
              <small>
                Inclui os rendimentos creditados diariamente e o capital
                devolvido ao final, quando aplicável. Capital retorna à carteira
                de origem. Somente rendimentos podem ser sacados com pacote
                ativo, sujeitos à taxa de saque.
              </small>
            </>
          )}
          {!plan.days && (
            <small>
              Sem prazo fixo: o rendimento depende do tempo até o resgate.
            </small>
          )}
        </div>
      ) : (
        <small role="status">
          Informe um valor entre {money(plan.min)} e {money(plan.max)} para
          calcular o retorno.
        </small>
      )}
      <label>
        Usar saldo de
        <select
          name="wallet"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        >
          <option value="deposit">
            Carteira de Saldo · {money(balances.deposit)}
          </option>
          <option value="earnings">
            Carteira de Rendimentos · {money(balances.earnings)}
          </option>
        </select>
      </label>
      <small>
        {plan.family === "vault"
          ? "CredCofre não participa da roleta."
          : wallet === "earnings"
            ? "Este reinvestimento libera 1 giro na roleta."
            : "A roleta é exclusiva para reinvestimentos com saldo de rendimentos."}
      </small>
      {valid && cents > balances[wallet] && (
        <small role="status">Saldo insuficiente na carteira selecionada.</small>
      )}
    </Form>
  );
}
