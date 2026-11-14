"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  History,
  LoaderCircle,
  LogOut,
  MessageCircle,
  QrCode,
  ScanLine,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Mode = "customer" | "merchant";
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type CreditLine = Database["public"]["Tables"]["credit_lines"]["Row"];
type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
type QrIntent = Database["public"]["Tables"]["qr_intents"]["Row"];
type WalletProvider = "Mercado Pago" | "Naranja X" | "Ualá" | "Personal Pay" | "Modo" | "Banco Nación" | "Bancor" | "Santander" | "Galicia" | "BBVA" | "Otro";

const walletProviders: WalletProvider[] = [
  "Mercado Pago",
  "Naranja X",
  "Ualá",
  "Personal Pay",
  "Modo",
  "Banco Nación",
  "Bancor",
  "Santander",
  "Galicia",
  "BBVA",
  "Otro",
];

const walletUrls: Partial<Record<WalletProvider, string>> = {
  "Mercado Pago": "https://www.mercadopago.com.ar/",
  "Naranja X": "https://www.naranjax.com/",
  "Ualá": "https://www.uala.com.ar/",
  "Personal Pay": "https://www.personalpay.com.ar/",
  "Modo": "https://www.modo.com.ar/",
  "Banco Nación": "https://www.bna.com.ar/",
  "Bancor": "https://www.bancor.com.ar/",
  "Santander": "https://www.santander.com.ar/",
  "Galicia": "https://www.galicia.ar/",
  "BBVA": "https://www.bbva.com.ar/",
};

type CreditLineView = CreditLine & {
  counterparty: Profile;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function money(amount: number) {
  return `$ ${moneyFormatter.format(Math.round(amount))}`;
}

function amountDigits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function parseAmountInput(value: string) {
  const digits = amountDigits(value);
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

function formatAmountInput(value: string) {
  return amountDigits(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function remainingReviewTime(deadline: string | null, now: number) {
  if (!deadline) return "Plazo no disponible";
  const remaining = new Date(deadline).getTime() - now;
  if (remaining <= 0) return "Plazo de verificación vencido";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${hours} h ${minutes} min ${seconds} s`;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function availableCredit(line: CreditLine) {
  return Math.max(Number(line.credit_limit) - Number(line.current_balance), 0);
}

function Brand() {
  return (
    <div className="inline-flex items-center rounded-2xl bg-[#09090B] px-3 py-2">
      <span className="text-[19px] font-extrabold tracking-[-0.07em] text-white">
        Credi<span className="text-[#22C55E]">f</span><span className="relative text-[#22C55E]">ı<Check size={8} strokeWidth={4} className="absolute -top-0.5 left-0.5" /></span>
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: Profile["status"] }) {
  const styles: Record<Profile["status"], string> = {
    active: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    blocked: "bg-zinc-100 text-zinc-600",
  };
  const labels: Record<Profile["status"], string> = {
    active: "Activo",
    pending: "Pendiente",
    blocked: "Bloqueado",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}

export default function CredifiDashboard({ mode }: { mode?: Mode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creditLines, setCreditLines] = useState<CreditLineView[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [qrIntents, setQrIntents] = useState<QrIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Mode>("customer");
  const [storeName, setStoreName] = useState("");
  const [alias, setAlias] = useState("");
  const [cvu, setCvu] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [confirmQr, setConfirmQr] = useState<QrIntent | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [editLine, setEditLine] = useState<CreditLineView | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerLimit, setCustomerLimit] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [paymentProfileOpen, setPaymentProfileOpen] = useState(false);
  const [walletProvider, setWalletProvider] = useState<WalletProvider>("Mercado Pago");
  const [walletHolder, setWalletHolder] = useState("");
  const [operationReference, setOperationReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptModal, setReceiptModal] = useState<{ url: string; customerName: string } | null>(null);
  const [rejectPayment, setRejectPayment] = useState<Transaction | null>(null);
  const [rejectReason, setRejectReason] = useState("Transferencia no acreditada");
  const [copyMessage, setCopyMessage] = useState("");
  const [clock, setClock] = useState(0);
  const authGeneration = useRef(0);
  const previousPaymentStatuses = useRef(new Map<string, Transaction["status"]>());

  const loadAccount = useCallback(async (account: User, showLoader: boolean) => {
    if (!supabase) return;
    const generation = ++authGeneration.current;
    if (showLoader) setLoading(true);
    const profileResult = await supabase.from("profiles").select("*").eq("id", account.id).single();
    if (generation !== authGeneration.current) return;
    if (profileResult.error) {
      setError(`No se pudo cargar tu perfil: ${profileResult.error.message}`);
      setProfile(null);
      setLoading(false);
      return;
    }

    const accountProfile = profileResult.data;
    const customerAccount = accountProfile.role === "customer";
    const [lineResult, transactionResult, intentResult] = await Promise.all([
      customerAccount
        ? supabase.from("credit_lines").select("*").eq("customer_id", account.id).order("created_at")
        : supabase.from("credit_lines").select("*").eq("merchant_id", account.id).order("created_at"),
      customerAccount
        ? supabase.from("transactions").select("*").eq("customer_id", account.id).order("created_at", { ascending: false })
        : supabase.from("transactions").select("*").eq("merchant_id", account.id).order("created_at", { ascending: false }),
      customerAccount
        ? supabase.from("qr_intents").select("*").eq("customer_id", account.id).order("created_at", { ascending: false })
        : supabase.from("qr_intents").select("*").eq("merchant_id", account.id).order("created_at", { ascending: false }),
    ]);
    if (generation !== authGeneration.current) return;
    const queryError = lineResult.error ?? transactionResult.error ?? intentResult.error;
    if (queryError) {
      setError(`No se pudieron cargar los datos de tu cuenta: ${queryError.message}`);
      setProfile(accountProfile);
      setLoading(false);
      return;
    }

    const rows = lineResult.data ?? [];
    const counterpartIds = rows.map((line) => customerAccount ? line.merchant_id : line.customer_id);
    let counterpartProfiles: Profile[] = [];
    if (counterpartIds.length) {
      const counterpartResult = await supabase.from("profiles").select("*").in("id", counterpartIds);
      if (generation !== authGeneration.current) return;
      if (counterpartResult.error) {
        setError(`No se pudieron cargar los perfiles vinculados: ${counterpartResult.error.message}`);
        setProfile(accountProfile);
        setLoading(false);
        return;
      }
      counterpartProfiles = counterpartResult.data ?? [];
    }

    const profileById = new Map(counterpartProfiles.map((item) => [item.id, item]));
    const views = rows.flatMap((line): CreditLineView[] => {
      const counterpart = profileById.get(customerAccount ? line.merchant_id : line.customer_id);
      return counterpart ? [{ ...line, counterparty: counterpart }] : [];
    });
    setUser(account);
    setProfile(accountProfile);
    setCreditLines(views);
    setTransactions(transactionResult.data ?? []);
    setQrIntents(intentResult.data ?? []);
    setSelectedLineId((current) => views.some((line) => line.id === current) ? current : views[0]?.id ?? "");
    setLoading(false);
    setError("");
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const account = session?.user ?? null;
      setUser(account);
      setProfile(null);
      setCreditLines([]);
      setTransactions([]);
      setQrIntents([]);
      setError("");
      setLoading(Boolean(account));
      if (account) {
        window.setTimeout(() => {
          if (active) void loadAccount(account, true);
        }, 0);
      } else {
        setLoading(false);
      }
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(`No se pudo recuperar la sesión: ${sessionError.message}`);
        setLoading(false);
      } else if (data.session) {
        setUser(data.session.user);
        void loadAccount(data.session.user, true);
      } else {
        setLoading(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      authGeneration.current += 1;
    };
  }, [loadAccount]);

  useEffect(() => {
    const client = supabase;
    if (!client || !profile || !user) return;
    const tableSubscriptions = [
      { table: "credit_lines", column: profile.role === "customer" ? "customer_id" : "merchant_id" },
      { table: "transactions", column: profile.role === "customer" ? "customer_id" : "merchant_id" },
      { table: "qr_intents", column: profile.role === "customer" ? "customer_id" : "merchant_id" },
    ] as const;
    const channel = client.channel(`credifi-${user.id}`);
    for (const item of tableSubscriptions) {
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: item.table,
        filter: `${item.column}=eq.${user.id}`,
      }, () => void loadAccount(user, false));
    }
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setError("Se interrumpió la conexión en tiempo real. Recargá la página para volver a sincronizar.");
      }
    });
    return () => {
      void client.removeChannel(channel);
    };
  }, [loadAccount, profile, user]);

  useEffect(() => {
    const initialClock = window.setTimeout(() => setClock(Date.now()), 0);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!mode || profile.role !== mode) {
      router.replace(profile.role === "customer" ? "/customer" : "/merchant");
    }
  }, [mode, profile, router]);

  const customerLines = profile?.role === "customer" ? creditLines : [];
  const selectedLine = creditLines.find((line) => line.id === selectedLineId) ?? creditLines[0] ?? null;
  const selectedQr = selectedQrId ? qrIntents.find((intent) => intent.id === selectedQrId) ?? null : null;
  const customerTransactions = useMemo(
    () => transactions,
    [transactions],
  );
  const pendingPayments = useMemo(
    () => transactions.filter((transaction) => transaction.type === "payment_notice" && transaction.status === "pending"),
    [transactions],
  );
  const pendingIntents = qrIntents.filter(
    (intent) => intent.status === "pending" && new Date(intent.expires_at).getTime() > clock,
  );

  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  useEffect(() => {
    if (profile?.role !== "customer") return;
    for (const transaction of transactions) {
      const previousStatus = previousPaymentStatuses.current.get(transaction.id);
      if (previousStatus === "pending" && transaction.status === "rejected") {
        notify(`Comprobante rechazado: ${transaction.rejection_reason ?? "revisá el aviso de pago"}.`);
      }
      previousPaymentStatuses.current.set(transaction.id, transaction.status);
    }
  }, [notify, profile?.role, transactions]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setAuthMessage("");
    if (authMode === "sign_up") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), role, store_name: storeName.trim(), alias: alias.trim(), cvu: cvu.trim() } },
      });
      if (signUpError) {
        setError(`No se pudo crear la cuenta: ${signUpError.message}`);
      } else if (!data.session) {
        setAuthMessage("Cuenta creada. Revisá tu email para confirmar la dirección antes de iniciar sesión.");
        setAuthMode("sign_in");
      } else {
        setAuthMessage("Cuenta creada. Cargando tu billetera…");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) setError(`No se pudo iniciar sesión: ${signInError.message}`);
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(`No se pudo cerrar la sesión: ${signOutError.message}`);
  }

  async function createQrIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedLine) return;
    const amount = parseAmountInput(amountInput);
    if (amount === null || amount <= 0) {
      setError("Ingresá un monto entero en pesos mayor a cero.");
      return;
    }
    if (selectedLine.counterparty.status !== "active") {
      setError("Solo podés generar un QR para un cliente activo.");
      return;
    }
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc("create_qr_intent", {
      p_customer_id: selectedLine.customer_id,
      p_amount: amount,
      p_description: description.trim() || "Compra en el comercio",
    });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo generar el QR: ${rpcError.message}`);
      return;
    }
    setSelectedQrId(data);
    setAmountInput("");
    setDescription("");
    setError("");
    await loadAccount(user!, false);
    notify("QR creado. Esperando la confirmación del cliente.");
  }

  async function approvePurchase(intent: QrIntent) {
    if (!supabase) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("approve_qr_intent", { p_intent_id: intent.id });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo aprobar la compra: ${rpcError.message}`);
      return;
    }
    setConfirmQr(null);
    setScanOpen(false);
    setError("");
    await loadAccount(user!, false);
    notify("Compra aprobada. El saldo se actualizó.");
  }

  async function notifyPayment() {
    if (!supabase || !selectedLine) return;
    if (!receiptFile) {
      setError("Adjuntá la imagen del comprobante para enviar el aviso.");
      return;
    }
    if (!profile?.wallet_provider || !profile.wallet_holder) {
      setError("Completá tu perfil de pago antes de enviar el aviso.");
      return;
    }
    const amount = paymentAmountInput.trim() ? parseAmountInput(paymentAmountInput) : null;
    if (paymentAmountInput.trim() && (amount === null || amount <= 0)) {
      setError("Ingresá un monto entero en pesos mayor a cero.");
      return;
    }
    if (amount !== null && amount > Number(selectedLine.current_balance)) {
      setError(`El monto supera la deuda actual de ${money(Number(selectedLine.current_balance))}.`);
      return;
    }
    if (operationReference.trim().length > 100) {
      setError("El número de operación no puede superar los 100 caracteres.");
      return;
    }
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[receiptFile.type];
    if (!extension || receiptFile.size > 10 * 1024 * 1024) {
      setError("Adjuntá una imagen JPG, PNG o WebP de hasta 10 MB.");
      return;
    }

    setBusy(true);
    const receiptPath = `${user!.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-receipts")
      .upload(receiptPath, receiptFile, { contentType: receiptFile.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      setError(`No se pudo guardar el comprobante: ${uploadError.message}`);
      return;
    }
    const { error: rpcError } = await supabase.rpc("notify_payment", {
      p_credit_line_id: selectedLine.id,
      p_amount: amount,
      p_receipt_path: receiptPath,
      p_operation_reference: operationReference.trim() || null,
    });
    if (rpcError) {
      const { error: cleanupError } = await supabase.storage.from("payment-receipts").remove([receiptPath]);
      setBusy(false);
      setError(cleanupError
        ? `No se pudo avisar el pago: ${rpcError.message}. Tampoco se pudo limpiar el comprobante temporal: ${cleanupError.message}`
        : `No se pudo avisar el pago: ${rpcError.message}`);
      return;
    }
    setBusy(false);
    setPayOpen(false);
    setPaymentAmountInput("");
    setOperationReference("");
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setError("");
    await loadAccount(user!, false);
    notify("Aviso enviado. El almacenero confirmará el pago.");
  }

  function handleReceiptChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setReceiptFile(null);
      setReceiptPreviewUrl(null);
      event.target.value = "";
      setError("Adjuntá una imagen JPG, PNG o WebP de hasta 10 MB.");
      return;
    }
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));
    setError("");
  }

  async function savePaymentProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("update_payment_profile", {
      p_wallet_provider: walletProvider,
      p_wallet_holder: walletHolder.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo guardar el perfil de pago: ${rpcError.message}`);
      return;
    }
    setPaymentProfileOpen(false);
    setError("");
    await loadAccount(user!, false);
    notify("Perfil de pago actualizado.");
  }

  async function confirmPayment(transactionId: string) {
    if (!supabase) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("confirm_payment_received", { p_transaction_id: transactionId });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo confirmar el pago: ${rpcError.message}`);
      return;
    }
    setError("");
    await loadAccount(user!, false);
    notify("Pago confirmado y crédito actualizado.");
  }

  async function rejectPaymentNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !rejectPayment) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("reject_payment_received", {
      p_transaction_id: rejectPayment.id,
      p_reason: rejectReason.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo rechazar el comprobante: ${rpcError.message}`);
      return;
    }
    setRejectPayment(null);
    setError("");
    await loadAccount(user!, false);
    notify("Comprobante rechazado. El cliente recibirá el aviso en su billetera.");
  }

  async function viewReceipt(payment: Transaction) {
    if (!supabase || !payment.receipt_path) {
      setError("Este aviso no tiene un comprobante disponible.");
      return;
    }
    const { data, error: signedUrlError } = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(payment.receipt_path, 120);
    if (signedUrlError) {
      setError(`No se pudo abrir el comprobante: ${signedUrlError.message}`);
      return;
    }
    const customerName = creditLines.find((line) => line.customer_id === payment.customer_id)?.counterparty.full_name ?? "Cliente";
    setReceiptModal({ url: data.signedUrl, customerName });
  }

  async function saveCreditLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editLine) return;
    const newLimit = parseAmountInput(limitInput);
    if (newLimit === null || newLimit < 0) {
      setError("Ingresá un límite válido en pesos, igual o mayor a cero.");
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("set_credit_limit", {
      p_credit_line_id: editLine.id,
      p_new_limit: newLimit,
    });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo actualizar el límite: ${rpcError.message}`);
      return;
    }
    setEditLine(null);
    setError("");
    await loadAccount(user!, false);
    notify(`Límite de ${editLine.counterparty.full_name} actualizado.`);
  }

  async function linkCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const initialLimit = customerLimit === "" ? 0 : parseAmountInput(customerLimit);
    if (initialLimit === null || initialLimit < 0) {
      setError("Ingresá un límite válido en pesos, igual o mayor a cero.");
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("link_customer", {
      p_customer_email: customerEmail.trim(),
      p_credit_limit: initialLimit,
    });
    setBusy(false);
    if (rpcError) {
      setError(`No se pudo vincular al cliente: ${rpcError.message}`);
      return;
    }
    setCustomerEmail("");
    setCustomerLimit("");
    setLinkOpen(false);
    setError("");
    await loadAccount(user!, false);
    notify("Cliente vinculado correctamente.");
  }

  async function copyAlias(alias: string, label = "Alias") {
    try {
      await navigator.clipboard.writeText(alias);
      setCopyMessage(`${label} copiado`);
      window.setTimeout(() => setCopyMessage(""), 2200);
    } catch (copyError) {
      setError(copyError instanceof Error ? `No se pudo copiar el alias: ${copyError.message}` : "No se pudo copiar el alias.");
    }
  }

  const onQrRead = useCallback(async (rawValue: string) => {
    if (!supabase || !user) return;
    setScanError("");
    let intentId = rawValue.trim();
    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (parsed && typeof parsed === "object" && "intentId" in parsed && typeof parsed.intentId === "string") {
        intentId = parsed.intentId;
      }
    } catch {
      intentId = rawValue.trim();
    }
    const { data, error: queryError } = await supabase.from("qr_intents").select("*").eq("id", intentId).maybeSingle();
    if (queryError) {
      setScanError(`No se pudo consultar el QR: ${queryError.message}`);
      return;
    }
    if (!data || data.customer_id !== user.id) {
      setScanError("Este QR no pertenece a una cuenta vinculada a tu billetera.");
      return;
    }
    setScanOpen(false);
    setConfirmQr(data);
  }, [user]);

  useEffect(() => {
    if (!scanOpen) return;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let cancelled = false;
    void import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (cancelled) return;
      scanner = new Html5Qrcode("credifi-qr-reader");
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => void onQrRead(decodedText),
          () => undefined,
        );
      } catch (startError) {
        if (!cancelled) setScanError(startError instanceof Error ? startError.message : "No se pudo iniciar la cámara. Revisá los permisos del navegador.");
      }
    }).catch((importError: unknown) => {
      if (!cancelled) setScanError(importError instanceof Error ? importError.message : "No se pudo cargar el lector QR.");
    });
    return () => {
      cancelled = true;
      if (scanner?.isScanning) {
        void scanner.stop().catch((stopError: unknown) => {
          if (!cancelled) setScanError(stopError instanceof Error ? stopError.message : "No se pudo detener la cámara.");
        });
      }
    };
  }, [onQrRead, scanOpen]);

  if (!supabaseConfigured || !supabase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5] px-5">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-card">
          <Brand />
          <h1 className="mt-5 text-xl font-bold">Falta configurar Supabase</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Completá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local y reiniciá la aplicación.</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5]"><LoaderCircle className="animate-spin text-green-600" size={28} /></main>;
  }

  if (user && !profile) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5] px-5"><section className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><p role="alert" className="text-sm text-red-700">{error || "No se pudo cargar el perfil de esta sesión."}</p><button type="button" onClick={() => void loadAccount(user, true)} className="mt-4 rounded-xl bg-[#09090B] px-4 py-3 text-sm font-bold text-white">Reintentar</button></section></main>;
  }

  if (!user || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5] px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <Brand />
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-green-700">Tu billetera del barrio</p>
          <h1 className="mt-2 text-2xl font-bold">{authMode === "sign_up" ? "Crear cuenta" : "Iniciar sesión"}</h1>
          <p className="mt-2 text-sm text-zinc-500">{authMode === "sign_up" ? "Registrate como cliente o almacenero." : "Ingresá para consultar tu cuenta Credifi."}</p>
          <form onSubmit={submitAuth} className="mt-6 space-y-4">
            {authMode === "sign_up" && <>
              <label className="block text-xs font-semibold text-zinc-700">Nombre completo
                <input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
              </label>
              <label className="block text-xs font-semibold text-zinc-700">Tipo de cuenta
                <select value={role} onChange={(event) => setRole(event.target.value as Mode)} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-green-500">
                  <option value="customer">Cliente</option>
                  <option value="merchant">Almacenero</option>
                </select>
              </label>
              {role === "merchant" && <>
                <label className="block text-xs font-semibold text-zinc-700">Nombre del comercio
                  <input value={storeName} onChange={(event) => setStoreName(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">Alias de transferencia
                  <input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={120} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">CVU (opcional)
                  <input value={cvu} onChange={(event) => setCvu(event.target.value)} maxLength={40} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
                </label>
              </>}
            </>}
            <label className="block text-xs font-semibold text-zinc-700">Email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
            </label>
            <label className="block text-xs font-semibold text-zinc-700">Contraseña
              <input required type="password" minLength={6} autoComplete={authMode === "sign_up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
            </label>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {authMessage && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{authMessage}</p>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#09090B] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">
              {busy && <LoaderCircle size={16} className="animate-spin" />}
              {authMode === "sign_up" ? "Crear cuenta" : "Ingresar"}
            </button>
          </form>
          <button type="button" onClick={() => { setAuthMode(authMode === "sign_up" ? "sign_in" : "sign_up"); setError(""); setAuthMessage(""); }} className="mt-5 w-full text-sm font-semibold text-green-700">
            {authMode === "sign_up" ? "Ya tengo cuenta · Iniciar sesión" : "¿Primera vez? Crear cuenta"}
          </button>
        </section>
      </main>
    );
  }

  const isCustomer = profile.role === "customer";
  const displayedMode = isCustomer ? "customer" : "merchant";
  const activeQr = selectedQr && selectedQr.status === "pending" && new Date(selectedQr.expires_at).getTime() > clock ? selectedQr : null;
  const merchantName = profile.store_name || profile.full_name;
  const paymentLine = isCustomer ? selectedLine : null;
  const isBlocked = profile.status !== "active";
  const savedWalletProvider = walletProviders.find((provider) => provider === profile.wallet_provider);
  const customerWalletUrl = savedWalletProvider ? walletUrls[savedWalletProvider] : null;

  return (
    <div id="top" className="min-h-screen bg-[#F4F4F5] pb-24 text-[#18181B] md:pb-8">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
        <div className={`mx-auto flex h-[68px] items-center justify-between px-4 sm:px-6 ${isCustomer ? "max-w-xl" : "max-w-6xl"}`}>
          <div className="flex items-center gap-3"><Brand />{isCustomer && <span className="hidden text-xs font-medium text-zinc-500 sm:block">Tu billetera del barrio</span>}</div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-zinc-600 sm:block">{profile.full_name}</span>
            <button type="button" onClick={() => void signOut()} aria-label="Cerrar sesión" className="rounded-full border border-zinc-200 bg-white p-2.5 text-zinc-700 hover:bg-zinc-50"><LogOut size={17} /></button>
          </div>
        </div>
      </header>

      {error && <div role="alert" className="mx-auto mt-4 flex max-w-4xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Cerrar aviso"><X size={17} /></button></div>}
      {isBlocked && <p role="alert" className="mx-auto mt-4 max-w-4xl rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Tu cuenta está {profile.status === "blocked" ? "bloqueada" : "pendiente"} y no puede operar.</p>}

      {isCustomer ? (
        <main className="mx-auto max-w-xl px-4 pb-8 pt-5 sm:px-6">
          <div className="mb-5">
            <p className="text-xs text-zinc-500">Hola, {profile.full_name.split(" ")[0]} 👋</p>
            <h1 className="mt-0.5 text-xl font-bold">Tu billetera</h1>
            <button type="button" onClick={() => {
              const savedProvider = walletProviders.find((provider) => provider === profile.wallet_provider);
              setWalletProvider(savedProvider ?? "Mercado Pago");
              setWalletHolder(profile.wallet_holder ?? "");
              setPaymentProfileOpen(true);
            }} className="mt-2 text-xs font-semibold text-green-700">
              {profile.wallet_provider && profile.wallet_holder ? `Perfil de pago: ${profile.wallet_provider}` : "Configurar perfil de pago"}
            </button>
            {customerLines.length > 1 && <label className="mt-3 block text-xs font-semibold text-zinc-600">Comercio
              <select value={selectedLine?.id ?? ""} onChange={(event) => setSelectedLineId(event.target.value)} className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm">
                {customerLines.map((line) => <option key={line.id} value={line.id}>{line.counterparty.store_name || line.counterparty.full_name}</option>)}
              </select>
            </label>}
          </div>

          {selectedLine ? <>
            <section className="overflow-hidden rounded-[28px] bg-[#09090B] p-5 text-white shadow-xl shadow-zinc-900/10 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate rounded-full bg-white/10 px-3 py-2 text-xs font-medium">{selectedLine.counterparty.store_name || selectedLine.counterparty.full_name}</span>
                <StatusPill status={profile.status} />
              </div>
              <p className="mt-8 text-xs font-medium text-white/60">Disponible para gastar</p>
              <p className="mt-1 text-[42px] font-bold leading-none tracking-tight text-[#22C55E] sm:text-5xl">{money(availableCredit(selectedLine))}</p>
              <div className="mt-7 flex justify-between gap-4 text-xs">
                <div><p className="text-white/55">Saldo utilizado / a pagar</p><p className="mt-1 font-semibold text-white">{money(Number(selectedLine.current_balance))}</p></div>
                <div className="text-right"><p className="text-white/55">Tope asignado</p><p className="mt-1 font-semibold text-white">{money(Number(selectedLine.credit_limit))}</p></div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#22C55E] transition-all" style={{ width: `${selectedLine.credit_limit ? Math.min((Number(selectedLine.current_balance) / Number(selectedLine.credit_limit)) * 100, 100) : 0}%` }} /></div>
            </section>
            <section className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={isBlocked} onClick={() => { setError(""); setScanError(""); setScanOpen(true); }} className="col-span-2 flex min-h-[58px] items-center justify-center gap-2 rounded-2xl bg-[#22C55E] px-5 py-4 font-bold text-[#052e16] disabled:opacity-50"><ScanLine size={21} /> Escanear QR</button>
              <button type="button" disabled={isBlocked || Number(selectedLine.current_balance) <= 0} onClick={() => { setError(""); setPaymentAmountInput(""); setPayOpen(true); }} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-sm font-bold disabled:opacity-50"><ArrowDownLeft size={18} className="text-[#16A34A]" /> Pagar cuenta</button>
              <a href="#movimientos" className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-4 text-sm font-bold"><History size={17} className="text-zinc-500" /> Movimientos</a>
            </section>
            {pendingIntents.filter((intent) => intent.customer_id === user.id).slice(0, 1).map((intent) => (
              <section key={intent.id} className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-bold text-green-900">Tenés un QR listo en el mostrador</p>
                <button type="button" onClick={() => setConfirmQr(intent)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#09090B] px-4 py-2.5 text-xs font-bold text-white"><QrCode size={15} /> Revisar · {money(Number(intent.amount))}</button>
              </section>
            ))}
            <section id="movimientos" className="mt-7">
              <div><h2 className="text-base font-bold">Movimientos</h2><p className="mt-1 text-xs text-zinc-500">Compras y pagos del comercio</p></div>
              <div className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white px-4">
                {customerTransactions.length ? customerTransactions.map((transaction) => {
                  const purchase = transaction.type === "purchase";
                  const rejected = transaction.type === "payment_notice" && transaction.status === "rejected";
                  const confirmedPayment = transaction.type === "payment";
                  const pendingNotice = transaction.type === "payment_notice" && transaction.status === "pending";
                  return <div key={transaction.id} className="flex items-center gap-3 py-4"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${purchase ? "bg-zinc-100 text-zinc-700" : rejected ? "bg-red-50 text-red-700" : pendingNotice ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>{purchase ? <CreditCard size={17} /> : <ArrowDownLeft size={18} />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{rejected ? "Comprobante rechazado" : pendingNotice ? "Comprobante enviado · pendiente de revisión" : transaction.description}</p><p className="mt-1 text-[11px] text-zinc-500">{dateFormatter.format(new Date(transaction.created_at))}</p>{rejected && <p className="mt-1 text-xs text-red-700">{transaction.rejection_reason}</p>}{pendingNotice && <p className="mt-1 text-xs text-amber-700">Plazo del comercio: {remainingReviewTime(transaction.review_deadline, clock)}</p>}</div><p className={`shrink-0 text-sm font-bold ${purchase ? "text-zinc-900" : rejected ? "text-red-700" : confirmedPayment ? "text-green-700" : "text-amber-700"}`}>{purchase ? "− " : confirmedPayment ? "+ " : ""}{money(Number(transaction.amount))}</p></div>;
                }) : <p className="py-8 text-center text-sm text-zinc-500">Todavía no tenés movimientos.</p>}
              </div>
            </section>
            {paymentLine?.counterparty.alias && <p className="mt-5 text-center text-xs text-zinc-500">Alias de transferencia: <strong>{paymentLine.counterparty.alias}</strong></p>}
          </> : <EmptyState title="Todavía no tenés comercios vinculados" text="Pedile al almacenero que vincule tu email para empezar a usar Credifi." />}
        </main>
      ) : (
        <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-green-700">Panel del comercio</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{merchantName}</h1><p className="mt-1 text-sm text-zinc-500">Cobrá rápido y llevá las cuentas claras con tus clientes.</p>{profile.alias && <p className="mt-1 text-xs text-zinc-500">Alias de cobro: <strong>{profile.alias}</strong>{profile.cvu && ` · CVU: ${profile.cvu}`}</p>}</div>
            <button type="button" disabled={isBlocked} onClick={() => setLinkOpen(true)} className="rounded-xl bg-[#09090B] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Vincular cliente</button>
          </div>

          <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Cobrar con QR</h2><p className="mt-1 text-xs text-zinc-500">El QR vence a los 5 minutos.</p></div><QrCode size={20} className="text-green-700" /></div>
              {activeQr ? (
                <div className="mt-5 rounded-2xl bg-[#09090B] p-5 text-center text-white">
                  <p className="text-xs font-medium text-white/65">Esperando confirmación del cliente</p>
                  <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={JSON.stringify({ type: "credifi-purchase", intentId: activeQr.id })} size={188} level="M" includeMargin /></div>
                  <p className="mt-4 text-3xl font-bold text-[#22C55E]">{money(Number(activeQr.amount))}</p>
                  <p className="mt-1 text-sm text-white/65">{activeQr.description}</p>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/50"><Clock3 size={13} /> Vence {dateFormatter.format(new Date(activeQr.expires_at))}</p>
                  <button type="button" onClick={() => setSelectedQrId(null)} className="mt-4 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10">Cerrar</button>
                </div>
              ) : (
                <form onSubmit={createQrIntent} className="mt-5">
                  <label htmlFor="qr-client" className="mb-1.5 block text-xs font-semibold text-zinc-700">Cliente</label>
                  <select id="qr-client" value={selectedLine?.id ?? ""} onChange={(event) => setSelectedLineId(event.target.value)} required disabled={!creditLines.length} className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm">
                    {creditLines.map((line) => <option key={line.id} value={line.id}>{line.counterparty.full_name} · Disponible {money(availableCredit(line))}</option>)}
                  </select>
                  {!creditLines.length && <p className="mt-2 text-xs text-zinc-500">Vinculá un cliente para generar un QR.</p>}
                  <div className="mt-4 rounded-2xl bg-zinc-50 p-4">
                    <p className="text-xs font-medium text-zinc-500">Monto del fiado</p>
                    <div className="mt-1 flex items-center gap-2"><span className="text-2xl font-semibold text-zinc-400">$</span><input aria-label="Monto en pesos" type="text" inputMode="numeric" value={formatAmountInput(amountInput)} onChange={(event) => setAmountInput(amountDigits(event.target.value))} placeholder="0" className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-zinc-300" /></div>
                    <p className="mt-1 text-[11px] text-zinc-500">Disponible: <strong className="text-green-700">{selectedLine ? money(availableCredit(selectedLine)) : money(0)}</strong></p>
                  </div>
                  <label htmlFor="qr-description" className="mb-1.5 mt-4 block text-xs font-semibold text-zinc-700">Detalle <span className="font-normal text-zinc-400">(opcional)</span></label>
                  <input id="qr-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} placeholder="Ej. Pan y gaseosa" className="w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm outline-none focus:border-green-500" />
                  <button type="submit" disabled={busy || isBlocked || !creditLines.length} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-3.5 text-sm font-bold text-[#052e16] disabled:opacity-50"><QrCode size={18} /> Generar QR de fiado</button>
                </form>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Avisos de pago</h2><p className="mt-1 text-xs text-zinc-500">Confirmá cuando veas la transferencia en tu cuenta.</p></div>{pendingPayments.length > 0 && <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-green-100 px-2 text-xs font-bold text-green-800">{pendingPayments.length}</span>}</div>
              <div className="mt-4 space-y-3">
                {pendingPayments.length ? pendingPayments.map((payment) => {
                  const payer = creditLines.find((line) => line.customer_id === payment.customer_id)?.counterparty;
                  const deadlinePassed = !payment.review_deadline || new Date(payment.review_deadline).getTime() <= clock;
                  return (
                    <div key={payment.id} className="rounded-2xl border border-green-100 bg-green-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{payer?.full_name ?? "Cliente"} avisó que transfirió</p>
                          <p className="mt-1 text-xs text-zinc-600">{dateFormatter.format(new Date(payment.created_at))} · {payment.description}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-green-700">{money(Number(payment.amount))}</p>
                      </div>
                      <div className="mt-3 space-y-1 rounded-xl bg-white/70 p-3 text-xs text-zinc-700">
                        <p><strong>Billetera/banco:</strong> {payment.source_wallet || "No informado"}</p>
                        <p><strong>Titular / Alias origen:</strong> {payment.source_holder || "No informado"}</p>
                        {payment.operation_reference && <p><strong>Número de operación:</strong> {payment.operation_reference}</p>}
                        <p className={deadlinePassed ? "font-semibold text-red-700" : "font-semibold text-amber-700"}>
                          {deadlinePassed ? "Plazo vencido" : `Tiempo para verificar: ${remainingReviewTime(payment.review_deadline, clock)}`}
                        </p>
                      </div>
                      <button type="button" disabled={busy || !payment.receipt_path} onClick={() => void viewReceipt(payment)} className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-bold disabled:opacity-50">Ver comprobante</button>
                      <button type="button" disabled={busy || isBlocked || deadlinePassed} onClick={() => void confirmPayment(payment.id)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09090B] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={15} /> Confirmar pago recibido</button>
                      <button type="button" disabled={busy || isBlocked || deadlinePassed} onClick={() => { setRejectReason("Transferencia no acreditada"); setRejectPayment(payment); }} className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-700 disabled:opacity-50">Rechazar comprobante</button>
                    </div>
                  );
                }) : <div className="rounded-2xl bg-zinc-50 px-4 py-8 text-center"><Bell size={20} className="mx-auto text-zinc-400" /><p className="mt-3 text-sm font-semibold">No hay pagos por confirmar</p><p className="mt-1 text-xs text-zinc-500">Los avisos de tus clientes aparecen acá.</p></div>}
              </div>
            </section>
          </div>

          <section id="clientes" className="mt-5 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 sm:px-6"><div><h2 className="font-bold">Mis clientes</h2><p className="mt-1 text-xs text-zinc-500">{creditLines.length} cuentas vinculadas</p></div><span className="hidden text-[11px] text-zinc-500 sm:block">Los cambios se sincronizan en tiempo real</span></div>
            <div className="divide-y divide-zinc-100">
              {creditLines.map((line) => (
                <article key={line.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold">{initials(line.counterparty.full_name)}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold">{line.counterparty.full_name}</p><StatusPill status={line.counterparty.status} /></div><p className="mt-1 text-xs text-zinc-500">{line.counterparty.phone || "Sin teléfono"}</p></div></div>
                    <div className="grid grid-cols-2 gap-4 sm:min-w-[280px]"><div><p className="text-[10px] font-medium text-zinc-500">Deuda actual</p><p className="mt-1 text-sm font-bold">{money(Number(line.current_balance))}</p></div><div><p className="text-[10px] font-medium text-zinc-500">Límite asignado</p><p className="mt-1 text-sm font-bold">{money(Number(line.credit_limit))}</p></div></div>
                    <button type="button" disabled={isBlocked} onClick={() => { setEditLine(line); setLimitInput(String(Math.round(Number(line.credit_limit)))); setError(""); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-bold disabled:opacity-50">Editar límite</button>
                    {line.counterparty.phone && <a href={`https://wa.me/${line.counterparty.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-50 px-3 py-2.5 text-xs font-bold text-green-800"><MessageCircle size={15} /> WhatsApp</a>}
                  </div>
                  <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-[#22C55E]" style={{ width: `${line.credit_limit ? Math.min((Number(line.current_balance) / Number(line.credit_limit)) * 100, 100) : 0}%` }} /></div><p className="w-32 text-right text-[10px] text-zinc-500">Disponible <strong className="text-green-700">{money(availableCredit(line))}</strong></p></div>
                </article>
              ))}
              {!creditLines.length && <p className="px-5 py-8 text-center text-sm text-zinc-500">Todavía no vinculaste clientes.</p>}
            </div>
          </section>
        </main>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl justify-around"><a href={isCustomer ? "#top" : "#clientes"} className="flex flex-col items-center gap-1 px-4 py-1 text-[10px] font-semibold text-green-700">{isCustomer ? <Wallet size={19} /> : <Store size={19} />}{displayedMode === "customer" ? "Billetera" : "Comercio"}</a><a href={isCustomer ? "#movimientos" : "#clientes"} className="flex flex-col items-center gap-1 px-4 py-1 text-[10px] font-semibold text-zinc-500"><History size={19} />{isCustomer ? "Movimientos" : "Clientes"}</a></div>
      </nav>

      {(error || notice) && notice && <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xl rounded-2xl bg-[#09090B] p-4 text-sm font-medium text-white shadow-xl md:bottom-5">{notice}</div>}

      {scanOpen && <Modal title="Escanear QR del comercio" onClose={() => setScanOpen(false)}>
        <p className="mb-4 text-sm text-zinc-500">Apuntá la cámara al QR que te muestra el almacenero.</p><div id="credifi-qr-reader" className="overflow-hidden rounded-2xl bg-zinc-100 [&_video]:rounded-2xl" />
        {scanError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{scanError}</p>}
        <button type="button" onClick={() => setScanOpen(false)} className="mt-4 w-full rounded-xl border border-zinc-200 py-3 text-sm font-semibold">Cerrar cámara</button>
      </Modal>}
      {confirmQr && <Modal title="Confirmar compra" onClose={() => setConfirmQr(null)}>
        <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-700"><CreditCard size={25} /></div><p className="mt-4 text-sm text-zinc-500">Vas a pagar con tu cuenta en el comercio</p><p className="mt-2 text-4xl font-bold tracking-tight">{money(Number(confirmQr.amount))}</p><p className="mt-2 text-sm text-zinc-500">{confirmQr.description}</p></div>
        <button type="button" disabled={busy || isBlocked} onClick={() => void approvePurchase(confirmQr)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] px-4 py-3.5 text-sm font-bold text-[#052e16] disabled:opacity-50"><Check size={17} /> Confirmar compra con Credifi</button>
        <button type="button" onClick={() => setConfirmQr(null)} className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-zinc-500">Cancelar</button>
      </Modal>}
      {payOpen && paymentLine && <Modal title="Avisar un pago" onClose={() => setPayOpen(false)}>
        <p className="text-sm text-zinc-500">La deuda actual es <strong className="text-zinc-900">{money(Number(paymentLine.current_balance))}</strong>. Dejá el monto vacío para avisar el pago total.</p>
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Monto transferido (opcional)
          <div className="mt-1.5 flex items-center rounded-xl border border-zinc-200 px-3.5"><span className="mr-2 text-zinc-400">$</span><input aria-label="Monto del pago en pesos" type="text" inputMode="numeric" value={formatAmountInput(paymentAmountInput)} onChange={(event) => setPaymentAmountInput(amountDigits(event.target.value))} placeholder={formatAmountInput(String(Math.round(Number(paymentLine.current_balance))))} className="w-full py-3 text-sm outline-none placeholder:text-zinc-400" /></div>
        </label>
        <div className="mt-4 rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-bold text-zinc-600">Transferí al comercio</p>
          {paymentLine.counterparty.alias ? <div className="mt-2 flex items-center justify-between gap-3"><p className="break-all text-sm font-bold">{paymentLine.counterparty.alias}</p><button type="button" onClick={() => void copyAlias(paymentLine.counterparty.alias!, "Alias")} aria-label="Copiar alias del comercio" className="shrink-0 rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700"><Copy size={16} /></button></div> : <p className="mt-2 text-xs text-zinc-500">El comercio no informó un alias.</p>}
          {paymentLine.counterparty.cvu && <div className="mt-2 flex items-center justify-between gap-3"><p className="break-all text-xs text-zinc-600">CVU: {paymentLine.counterparty.cvu}</p><button type="button" onClick={() => void copyAlias(paymentLine.counterparty.cvu!, "CVU")} aria-label="Copiar CVU del comercio" className="shrink-0 rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700"><Copy size={16} /></button></div>}
        </div>
        {profile.wallet_provider && profile.wallet_holder ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
            <p>Vas a transferir desde <strong>{profile.wallet_provider}</strong> · <strong>{profile.wallet_holder}</strong></p>
            {customerWalletUrl && <a href={customerWalletUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-green-50 px-3 py-2 font-bold text-green-800">Abrir billetera</a>}
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            Configurá tu billetera y el titular de origen para que el comercio pueda identificar la transferencia.
            <button type="button" onClick={() => { setWalletProvider("Mercado Pago"); setWalletHolder(""); setPaymentProfileOpen(true); }} className="ml-1 font-bold underline">Completar perfil</button>
          </div>
        )}
        <label className="mt-4 block text-xs font-semibold text-zinc-700">Comprobante de transferencia (obligatorio)
          <input required type="file" accept="image/*" onChange={handleReceiptChange} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-green-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-green-800" />
        </label>
        {receiptFile && receiptPreviewUrl && <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2"><Image src={receiptPreviewUrl} alt="Vista previa del comprobante adjunto" width={720} height={480} unoptimized className="mx-auto max-h-64 w-auto rounded-lg object-contain" /><p className="mt-2 truncate text-center text-xs text-zinc-500">{receiptFile.name}</p></div>}
        <label className="mt-3 block text-xs font-semibold text-zinc-700">Número de comprobante / operación (opcional)
          <input value={operationReference} onChange={(event) => setOperationReference(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm" />
        </label>
        {copyMessage && <p role="status" className="mt-2 text-xs text-green-700">{copyMessage}</p>}
        <button type="button" disabled={busy || !receiptFile || !profile.wallet_provider || !profile.wallet_holder} onClick={() => void notifyPayment()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09090B] px-4 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><ArrowRight size={17} /> Enviar aviso de pago</button>
      </Modal>}
      {paymentProfileOpen && <Modal title="Perfil de pago" onClose={() => setPaymentProfileOpen(false)}>
        <p className="mb-4 text-sm text-zinc-500">Estos datos se compartirán con el comercio junto con cada aviso para ayudar a identificar la transferencia.</p>
        <form onSubmit={savePaymentProfile} className="space-y-4">
          <label className="block text-xs font-semibold text-zinc-700">Billetera o banco habitual
            <select required value={walletProvider} onChange={(event) => setWalletProvider(event.target.value as WalletProvider)} className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm">
              {walletProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-zinc-700">Nombre del titular / Alias origen
            <input required minLength={2} maxLength={120} value={walletHolder} onChange={(event) => setWalletHolder(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm" />
          </label>
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#09090B] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">Guardar perfil de pago</button>
        </form>
      </Modal>}
      {receiptModal && <Modal title={`Comprobante de ${receiptModal.customerName}`} onClose={() => setReceiptModal(null)}>
        <Image src={receiptModal.url} alt={`Comprobante de transferencia de ${receiptModal.customerName}`} width={1200} height={1600} unoptimized className="mx-auto max-h-[72vh] w-auto rounded-xl object-contain" />
      </Modal>}
      {rejectPayment && <Modal title="Rechazar comprobante" onClose={() => setRejectPayment(null)}>
        <p className="mb-4 text-sm text-zinc-500">La deuda del cliente no cambiará. Indicá brevemente por qué no se confirma la transferencia.</p>
        <form onSubmit={rejectPaymentNotice}>
          <label className="block text-xs font-semibold text-zinc-700">Motivo del rechazo
            <input required minLength={3} maxLength={160} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm" />
          </label>
          <button type="submit" disabled={busy} className="mt-4 w-full rounded-xl bg-red-700 px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">Rechazar y notificar al cliente</button>
        </form>
      </Modal>}
      {editLine && <Modal title="Editar límite de crédito" onClose={() => setEditLine(null)}>
        <p className="mb-3 text-sm text-zinc-500">Límite para {editLine.counterparty.full_name}</p>
        <form onSubmit={saveCreditLimit}><label className="block text-xs font-semibold text-zinc-700">Nuevo límite en pesos<input required type="text" inputMode="numeric" value={formatAmountInput(limitInput)} onChange={(event) => setLimitInput(amountDigits(event.target.value))} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm" /></label><div className="mt-5 flex gap-2"><button type="button" onClick={() => setEditLine(null)} className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-semibold">Cancelar</button><button type="submit" disabled={busy} className="flex-1 rounded-xl bg-[#22C55E] py-3 text-sm font-bold text-[#052e16] disabled:opacity-50">Guardar límite</button></div></form>
      </Modal>}
      {linkOpen && <Modal title="Vincular cliente" onClose={() => setLinkOpen(false)}>
        <p className="mb-4 text-sm text-zinc-500">El cliente debe haber creado y confirmado su cuenta Credifi.</p>
        <form onSubmit={linkCustomer} className="space-y-4"><label className="block text-xs font-semibold text-zinc-700">Email del cliente<input required type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm" /></label><label className="block text-xs font-semibold text-zinc-700">Límite inicial (opcional)<input type="text" inputMode="numeric" value={formatAmountInput(customerLimit)} onChange={(event) => setCustomerLimit(amountDigits(event.target.value))} placeholder="0" className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3.5 py-3 text-sm" /></label><button type="submit" disabled={busy} className="w-full rounded-xl bg-[#09090B] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">Vincular cuenta</button></form>
      </Modal>}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <section className="mt-5 rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center"><Store className="mx-auto text-zinc-400" size={24} /><h2 className="mt-3 font-bold">{title}</h2><p className="mt-1 text-sm text-zinc-500">{text}</p></section>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full bg-zinc-100 p-2 text-zinc-600 hover:bg-zinc-200"><X size={17} /></button></div>{children}</section></div>;
}
