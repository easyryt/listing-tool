"use client";

import {
  ArrowLeft,
  Check,
  Database,
  Download,
  Edit3,
  Image as ImageIcon,
  Layers3,
  Package,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { Product as ProductFormProduct } from "@/components/ProductForm/ProductCard";
import { exportExcel } from "@/lib/excel";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "https://listing-backend-code.onrender.com/api"
    : "https://listing-backend-code.onrender.com/api")
).replace(/\/$/, "");

type Product = ProductFormProduct & {
  createdAt?: string;
  updatedAt?: string;
  image?: string;
};

type Charm = Product & {
  sourceProductId?: string;
  sourceKind?: "parent" | "variant";
  sourceVariantNumber?: number;
  createdAt?: string;
  updatedAt?: string;
  image?: string;
};

type CharmDraft = Charm & {
  sourceProductId: string;
  sourceKind: "parent" | "variant";
  draft: true;
};

type EditableRow = Charm | CharmDraft;
type WorkspaceTab = "drafts" | "stored";

type EditableField =
  | "productName"
  | "description"
  | "brand"
  | "category"
  | "material"
  | "color"
  | "theme"
  | "type"
  | "price"
  | "mrp"
  | "gst"
  | "hsn"
  | "weight"
  | "inventory"
  | "country"
  | "manufacturer"
  | "manufacturerAddress"
  | "manufacturerPincode"
  | "packer"
  | "packerAddress"
  | "packerPincode"
  | "importer"
  | "importerAddress"
  | "importerPincode"
  | "genericName"
  | "size"
  | "quantity"
  | "length"
  | "width"
  | "designName"
  | "designCode"
  | "designNumber"
  | "sku"
  | "printType"
  | "finish"
  | "version"
  | "groupId"
  | "image1"
  | "image2"
  | "image3"
  | "image4";

type FieldSpec = {
  key: EditableField;
  label: string;
  number?: boolean;
  multiline?: boolean;
  locked?: boolean;
  placeholder?: string;
};

type FieldGroup = {
  title: string;
  description: string;
  fields: FieldSpec[];
};

type ProductDetailResponse = {
  success: boolean;
  product: Product;
  parent: Product | null;
  variants: Product[];
};

type ProductsResponse = {
  success: boolean;
  products: Product[];
};

type CharmsResponse = {
  success: boolean;
  charms: Charm[];
};

type CharmResponse = {
  success: boolean;
  message: string;
  charm: Charm;
};

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: "Basic information",
    description: "Customer-facing product details.",
    fields: [
      { key: "productName", label: "Product Name", multiline: true },
      { key: "description", label: "Description", multiline: true },
      { key: "brand", label: "Brand" },
      { key: "category", label: "Category" },
      { key: "material", label: "Material" },
      { key: "color", label: "Color" },
      { key: "theme", label: "Theme" },
      { key: "type", label: "Product Type" },
    ],
  },
  {
    title: "Pricing and inventory",
    description: "Commercial and stock values.",
    fields: [
      { key: "price", label: "Price", number: true },
      { key: "mrp", label: "MRP", number: true },
      { key: "gst", label: "GST", number: true },
      { key: "hsn", label: "HSN" },
      { key: "weight", label: "Weight", number: true },
      { key: "inventory", label: "Inventory", number: true },
    ],
  },
  {
    title: "Design and listing",
    description: "The Design Number stays locked to the parent design.",
    fields: [
      { key: "designName", label: "Design Name" },
      { key: "designCode", label: "Design Code" },
      { key: "designNumber", label: "Design Number", locked: true },
      { key: "sku", label: "SKU", multiline: true },
      { key: "printType", label: "Print Type" },
      { key: "finish", label: "Finish" },
      { key: "version", label: "Version" },
      { key: "groupId", label: "Group ID" },
    ],
  },
  {
    title: "Package details",
    description: "Physical and catalogue attributes.",
    fields: [
      { key: "country", label: "Country" },
      { key: "genericName", label: "Generic Name" },
      { key: "size", label: "Size" },
      { key: "quantity", label: "Quantity", number: true },
      { key: "length", label: "Length", number: true },
      { key: "width", label: "Width", number: true },
    ],
  },
  {
    title: "Manufacturer",
    description: "Manufacturer, packer and importer information.",
    fields: [
      { key: "manufacturer", label: "Manufacturer" },
      { key: "manufacturerAddress", label: "Manufacturer Address", multiline: true },
      { key: "manufacturerPincode", label: "Manufacturer Pincode" },
      { key: "packer", label: "Packer" },
      { key: "packerAddress", label: "Packer Address", multiline: true },
      { key: "packerPincode", label: "Packer Pincode" },
      { key: "importer", label: "Importer" },
      { key: "importerAddress", label: "Importer Address", multiline: true },
      { key: "importerPincode", label: "Importer Pincode" },
    ],
  },
  {
    title: "Images",
    description: "Edit all four listing image URLs with instant previews.",
    fields: [
      { key: "image1", label: "Image 1 URL", multiline: true, placeholder: "https://..." },
      { key: "image2", label: "Image 2 URL", multiline: true, placeholder: "https://..." },
      { key: "image3", label: "Image 3 URL", multiline: true, placeholder: "https://..." },
      { key: "image4", label: "Image 4 URL", multiline: true, placeholder: "https://..." },
    ],
  },
];

const EDITABLE_FIELDS = FIELD_GROUPS.flatMap((group) =>
  group.fields.map((field) => field.key),
);

const NUMBER_FIELDS = new Set(
  FIELD_GROUPS.flatMap((group) =>
    group.fields.filter((field) => field.number).map((field) => field.key),
  ),
);

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && data.message
        ? data.message
        : "Request failed.";
    throw new ApiError(message, response.status);
  }

  return data as T;
}

function alreadyHasCharms(value: string) {
  return /\bwith\s+charms?\b/i.test(String(value || ""));
}

function charmTitle(value: string) {
  const title = String(value || "").trim();
  if (!title || alreadyHasCharms(title)) return title;
  const printIndex = title.toLowerCase().lastIndexOf(" print");
  return printIndex >= 0
    ? `${title.slice(0, printIndex)} With Charms${title.slice(printIndex)}`
    : `${title} With Charms`;
}

function charmDesignName(value: string) {
  const designName = String(value || "").trim();
  return !designName || alreadyHasCharms(designName)
    ? designName
    : `${designName} With Charms`;
}

function charmSku(value: string) {
  const sku = String(value || "").trim().toUpperCase();
  if (!sku || /\bWITH[\s-]+CHRM(?:S)?\b/i.test(sku)) return sku;
  const versionMatch = sku.match(/-(\d+(?:\.\d+)*\.V\d+)$/i);
  return versionMatch?.index !== undefined
    ? `${sku.slice(0, versionMatch.index)}-WITH CHRM${sku.slice(versionMatch.index)}`
    : `${sku}-WITH CHRM`;
}

function createDraft(product: Product): CharmDraft {
  return {
    ...product,
    id: `draft-${product.id}`,
    productName: charmTitle(product.productName),
    designName: charmDesignName(product.designName),
    sku: charmSku(product.sku),
    sourceProductId: product.id,
    sourceKind: product.parentId ? "variant" : "parent",
    sourceVariantNumber: product.variantNumber,
    draft: true,
  };
}

function sourceLabel(item: Product | EditableRow) {
  const savedKind = "sourceKind" in item ? item.sourceKind : undefined;
  const savedNumber = "sourceVariantNumber" in item ? item.sourceVariantNumber : undefined;
  const kind = savedKind ?? (item.parentId ? "variant" : "parent");
  return kind === "variant"
    ? `Variant V${savedNumber ?? item.variantNumber ?? item.version ?? "2"}`
    : "Parent";
}

function getImage(item: Product | EditableRow) {
  return item.image || item.image1 || item.image2 || item.image3 || item.image4 || "";
}

function cloneRow<T extends EditableRow>(row: T): T {
  return {
    ...row,
    models: (row.models ?? []).map((model) => ({ ...model })),
  };
}

function updateField<T extends EditableRow>(row: T, field: EditableField, value: string): T {
  return {
    ...row,
    [field]: NUMBER_FIELDS.has(field) ? Number(value || 0) : value,
  } as T;
}

function rowPayload(row: EditableRow) {
  const payload: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) payload[field] = row[field];
  payload.models = row.models;
  return payload;
}

function currency(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export default function CharmManager({
  designNumber,
  productId,
}: {
  designNumber: string;
  productId?: string;
}) {
  const router = useRouter();
  const [rootProduct, setRootProduct] = useState<Product | null>(null);
  const [sources, setSources] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<CharmDraft[]>([]);
  const [charms, setCharms] = useState<Charm[]>([]);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("drafts");
  const [sourceSearch, setSourceSearch] = useState("");
  const [rowSearch, setRowSearch] = useState("");
  const [showAllSources, setShowAllSources] = useState(false);
  const [editor, setEditor] = useState<{ mode: WorkspaceTab; row: EditableRow } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError(null);

        let selectedId = productId;
        if (!selectedId) {
          const productsResult = await apiRequest<ProductsResponse>(
            `/products?kind=parent&limit=50&search=${encodeURIComponent(designNumber)}`,
          );
          selectedId = productsResult.products.find(
            (product) => String(product.designNumber) === String(designNumber),
          )?.id;
        }
        if (!selectedId) throw new Error(`No product found for design number ${designNumber}.`);

        const detail = await apiRequest<ProductDetailResponse>(
          `/products/${encodeURIComponent(selectedId)}`,
        );
        const root = detail.parent ?? detail.product;
        const sourceMap = new Map<string, Product>([[root.id, root]]);
        for (const variant of detail.variants ?? []) sourceMap.set(variant.id, variant);

        const charmsResult = await apiRequest<CharmsResponse>(
          `/products/${encodeURIComponent(root.id)}/charms`,
        );
        const loadedCharms = charmsResult.charms ?? [];

        setRootProduct(root);
        setSources([...sourceMap.values()]);
        setCharms(loadedCharms);
        setSelectedExportIds(new Set(loadedCharms.map((charm) => charm.id)));
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 404) {
          setError("The charm API is not running yet. Restart or redeploy listing-backend, then refresh.");
        } else {
          setError(loadError instanceof Error ? loadError.message : "Unable to load charm data.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [designNumber, productId],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const variants = useMemo(
    () => sources.filter((source) => Boolean(source.parentId)),
    [sources],
  );

  const draftSourceIds = useMemo(
    () => new Set(drafts.map((draft) => draft.sourceProductId)),
    [drafts],
  );

  const storedSourceIds = useMemo(() => {
    const ids = new Set(
      charms.map((charm) => charm.sourceProductId).filter((id): id is string => Boolean(id)),
    );
    for (const source of sources) {
      if (charms.some((charm) => charm.sku.toUpperCase() === charmSku(source.sku))) ids.add(source.id);
    }
    return ids;
  }, [charms, sources]);

  const filteredSources = useMemo(() => {
    const query = sourceSearch.trim().toLowerCase();
    const result = !query
      ? sources
      : sources.filter((source) =>
          [source.productName, source.designName, source.sku, source.models?.[0]?.model]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
        );
    return showAllSources ? result : result.slice(0, 6);
  }, [showAllSources, sourceSearch, sources]);

  const visibleRows = useMemo(() => {
    const rows: EditableRow[] = activeTab === "drafts" ? drafts : charms;
    const query = rowSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.productName, row.designName, row.sku, row.models?.[0]?.model, sourceLabel(row)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activeTab, charms, drafts, rowSearch]);

  const selectedExportCharms = useMemo(
    () => charms.filter((charm) => selectedExportIds.has(charm.id)),
    [charms, selectedExportIds],
  );

  const allCharmsSelected =
    charms.length > 0 && charms.every((charm) => selectedExportIds.has(charm.id));

  const generateOne = (source: Product) => {
    if (draftSourceIds.has(source.id) || storedSourceIds.has(source.id)) return;
    setDrafts((current) => [...current, createDraft(source)]);
    setActiveTab("drafts");
    setMessage(`Editable charm draft generated from ${sourceLabel(source)}.`);
  };

  const generateAll = () => {
    const missing = sources.filter(
      (source) => !draftSourceIds.has(source.id) && !storedSourceIds.has(source.id),
    );
    if (!missing.length) {
      setMessage("Every source already has a draft or stored charm.");
      return;
    }
    setDrafts((current) => [...current, ...missing.map(createDraft)]);
    setActiveTab("drafts");
    setMessage(`${missing.length} charm draft${missing.length === 1 ? "" : "s"} generated.`);
  };

  const storeDraftRequest = (draft: CharmDraft) =>
    apiRequest<CharmResponse>(
      `/products/${encodeURIComponent(draft.sourceProductId)}/with-charm`,
      { method: "POST", body: JSON.stringify(rowPayload(draft)) },
    );

  const storeDraft = async (draft: CharmDraft) => {
    try {
      setSavingIds((current) => new Set(current).add(draft.id));
      setError(null);
      const result = await storeDraftRequest(draft);
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      setCharms((current) => [result.charm, ...current]);
      setSelectedExportIds((current) => new Set(current).add(result.charm.id));
      setEditor(null);
      setMessage(`${sourceLabel(draft)} charm stored separately.`);
    } catch (storeError) {
      setError(storeError instanceof Error ? storeError.message : "Unable to store charm.");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(draft.id);
        return next;
      });
    }
  };

  const storeAllDrafts = async () => {
    if (!drafts.length) return;
    try {
      setBulkSaving(true);
      setError(null);
      const snapshot = drafts;
      const results = await Promise.allSettled(snapshot.map(storeDraftRequest));
      const stored: Charm[] = [];
      const failedIds = new Set<string>();
      const errors: string[] = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") stored.push(result.value.charm);
        else {
          failedIds.add(snapshot[index].id);
          errors.push(result.reason instanceof Error ? result.reason.message : "A charm failed.");
        }
      });

      setCharms((current) => [...stored, ...current]);
      setDrafts((current) => current.filter((draft) => failedIds.has(draft.id)));
      setSelectedExportIds((current) => {
        const next = new Set(current);
        stored.forEach((charm) => next.add(charm.id));
        return next;
      });

      if (errors.length) setError(`${stored.length} stored, ${errors.length} failed. ${errors[0]}`);
      else {
        setActiveTab("stored");
        setMessage(`${stored.length} charm${stored.length === 1 ? "" : "s"} stored.`);
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const saveStoredCharm = async (charm: Charm) => {
    if (!rootProduct) return;
    try {
      setSavingIds((current) => new Set(current).add(charm.id));
      setError(null);
      const result = await apiRequest<CharmResponse>(
        `/products/${encodeURIComponent(rootProduct.id)}/charms/${encodeURIComponent(charm.id)}`,
        { method: "PATCH", body: JSON.stringify(rowPayload(charm)) },
      );
      setCharms((current) =>
        current.map((item) => (item.id === charm.id ? result.charm : item)),
      );
      setEditor(null);
      setMessage("Charm changes saved. The source product was not changed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update charm.");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(charm.id);
        return next;
      });
    }
  };

  const deleteCharm = async (charm: Charm) => {
    if (!rootProduct || !window.confirm(`Delete charm “${charm.productName}”?`)) return;
    try {
      setDeletingId(charm.id);
      await apiRequest(
        `/products/${encodeURIComponent(rootProduct.id)}/charms/${encodeURIComponent(charm.id)}`,
        { method: "DELETE" },
      );
      setCharms((current) => current.filter((item) => item.id !== charm.id));
      setSelectedExportIds((current) => {
        const next = new Set(current);
        next.delete(charm.id);
        return next;
      });
      setMessage("Charm deleted. The source product was not changed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete charm.");
    } finally {
      setDeletingId(null);
    }
  };

  const exportCharms = async (rows: Charm[]) => {
    if (!rows.length) {
      setError("Select at least one stored charm to export.");
      return;
    }
    try {
      setIsExporting(true);
      await exportExcel(rows, {
        preserveProductSku: true,
        fileName: `meesho-charms-design-${designNumber}.xlsx`,
      });
      setMessage(`${rows.length} charm${rows.length === 1 ? "" : "s"} exported.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export charms.");
    } finally {
      setIsExporting(false);
    }
  };

  const updateEditorField = (field: EditableField, value: string) => {
    setEditor((current) =>
      current ? { ...current, row: updateField(current.row, field, value) } : current,
    );
  };

  const updateEditorModels = (value: string) => {
    const models = value
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean)
      .map((model) => ({ model }));
    setEditor((current) =>
      current ? { ...current, row: { ...current.row, models } } : current,
    );
  };

  const applyDraftChanges = () => {
    if (!editor || editor.mode !== "drafts") return;
    setDrafts((current) =>
      current.map((draft) => (draft.id === editor.row.id ? (editor.row as CharmDraft) : draft)),
    );
    setEditor(null);
    setMessage("Draft changes applied.");
  };

  if (loading) return <LoadingPage />;

  return (
    <main className="min-h-screen bg-[#f6f8fb]">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => router.push("/products")}
                className="mt-0.5 inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Wand2 size={19} className="text-blue-600" />
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    Charm Manager
                  </h1>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                    Design {designNumber}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {rootProduct?.designName || "Create and manage charms from product data."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className={secondaryButtonClass}
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                onClick={generateAll}
                disabled={!sources.length}
                className={primaryButtonClass}
              >
                <Wand2 size={16} />
                Generate All Missing
              </button>
            </div>
          </div>
        </header>

        {error && <Notice tone="error" message={error} onClose={() => setError(null)} />}
        {message && <Notice tone="success" message={message} onClose={() => setMessage(null)} />}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Parent product" value={rootProduct ? "1" : "0"} helper="Original listing" icon={<Package size={20} />} />
          <Stat label="Product variants" value={String(variants.length)} helper="Available sources" icon={<Layers3 size={20} />} />
          <Stat label="Charm drafts" value={String(drafts.length)} helper="Ready for review" icon={<Wand2 size={20} />} />
          <Stat label="Stored charms" value={String(charms.length)} helper="Saved separately" icon={<Database size={20} />} />
        </section>

        <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              step="Step 1"
              title="Choose a source product"
              text="Create a charm from the parent product or any individual variant."
            />
            <SearchBox value={sourceSearch} onChange={setSourceSearch} placeholder="Search source options..." />
          </div>
          {filteredSources.length ? (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredSources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  drafted={draftSourceIds.has(source.id)}
                  stored={storedSourceIds.has(source.id)}
                  onGenerate={() => generateOne(source)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search size={25} />}
              title="No source products found"
              text="Try a different product name, SKU, model or design search."
            />
          )}
          {sources.length > 6 && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                type="button"
                onClick={() => setShowAllSources((current) => !current)}
                className="text-xs font-bold text-blue-600 transition hover:text-blue-800"
              >
                {showAllSources ? "Show fewer options" : `Show all ${sources.length} options`}
              </button>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <SectionTitle
                step="Step 2"
                title="Review and manage charm data"
                text="Edit every field, save drafts separately and export stored charms."
              />
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={rowSearch} onChange={setRowSearch} placeholder="Search rows..." />
                {activeTab === "drafts" && drafts.length > 0 && <button type="button" onClick={() => void storeAllDrafts()} disabled={bulkSaving} className={successButtonClass}>{bulkSaving ? <RefreshCw size={15} className="animate-spin" /> : <Database size={15} />}Store All Drafts</button>}
                {activeTab === "stored" && charms.length > 0 && <><button type="button" onClick={() => setSelectedExportIds(allCharmsSelected ? new Set() : new Set(charms.map((charm) => charm.id)))} className={secondaryButtonClass}>{allCharmsSelected ? "Clear Selection" : "Select All"}</button><button type="button" onClick={() => void exportCharms(selectedExportCharms)} disabled={isExporting || !selectedExportCharms.length} className={successButtonClass}>{isExporting ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}Export ({selectedExportCharms.length})</button></>}
              </div>
            </div>
            <div className="mt-5 inline-flex rounded-xl bg-slate-100 p-1">
              <TabButton active={activeTab === "drafts"} onClick={() => setActiveTab("drafts")} label="Drafts" count={drafts.length} />
              <TabButton active={activeTab === "stored"} onClick={() => setActiveTab("stored")} label="Stored Charms" count={charms.length} />
            </div>
          </div>

          {visibleRows.length ? (
            <CharmTable
              rows={visibleRows}
              mode={activeTab}
              selectedIds={selectedExportIds}
              savingIds={savingIds}
              deletingId={deletingId}
              onToggleSelect={(id) => setSelectedExportIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
              onEdit={(row) => setEditor({ mode: activeTab, row: cloneRow(row) })}
              onStore={(row) => void storeDraft(row as CharmDraft)}
              onDelete={(row) => activeTab === "drafts" ? setDrafts((current) => current.filter((draft) => draft.id !== row.id)) : void deleteCharm(row as Charm)}
            />
          ) : (
            <EmptyState
              icon={activeTab === "drafts" ? <Wand2 size={28} /> : <Database size={28} />}
              title={rowSearch ? "No matching rows" : activeTab === "drafts" ? "No charm drafts" : "No stored charms"}
              text={rowSearch ? "Try another search." : activeTab === "drafts" ? "Generate a charm from a source option above." : "Store a draft to see it here."}
            />
          )}
        </section>
      </div>

      {editor && (
        <EditDrawer
          editor={editor}
          saving={savingIds.has(editor.row.id)}
          onClose={() => setEditor(null)}
          onFieldChange={updateEditorField}
          onModelsChange={updateEditorModels}
          onApplyDraft={applyDraftChanges}
          onStoreDraft={() => void storeDraft(editor.row as CharmDraft)}
          onSaveStored={() => void saveStoredCharm(editor.row as Charm)}
        />
      )}
    </main>
  );
}

function SourceCard({ source, drafted, stored, onGenerate }: { source: Product; drafted: boolean; stored: boolean; onGenerate: () => void }) {
  const image = getImage(source);
  return (
    <article className="group flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-blue-200 hover:shadow-sm">
      <Thumbnail image={image} alt={source.productName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <SourceBadge item={source} />
          <span className="text-[10px] font-semibold text-slate-400">#{source.designNumber}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
          {source.productName}
        </h3>
        <p className="mt-1 truncate text-xs text-slate-500">
          {source.models?.map((model) => model.model).join(", ") || "No models"}
        </p>
        <button
          type="button"
          onClick={onGenerate}
          disabled={drafted || stored}
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {stored ? <Check size={13} /> : <Wand2 size={13} />}
          {stored ? "Charm stored" : drafted ? "Draft ready" : "Generate charm"}
        </button>
      </div>
    </article>
  );
}

function CharmTable({ rows, mode, selectedIds, savingIds, deletingId, onToggleSelect, onEdit, onStore, onDelete }: { rows: EditableRow[]; mode: WorkspaceTab; selectedIds: Set<string>; savingIds: Set<string>; deletingId: string | null; onToggleSelect: (id: string) => void; onEdit: (row: EditableRow) => void; onStore: (row: EditableRow) => void; onDelete: (row: EditableRow) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1150px] border-collapse text-left">
        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr>{mode === "stored" && <th className="w-12 px-4 py-3">Export</th>}<th className="px-4 py-3">Product</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Models</th><th className="px-4 py-3">Design</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const saving = savingIds.has(row.id);
            return (
              <tr key={row.id} className="bg-white align-middle hover:bg-slate-50/70">
                {mode === "stored" && <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggleSelect(row.id)} aria-label={`Select ${row.productName} for export`} className="h-4 w-4 accent-emerald-600" /></td>}
                <td className="max-w-80 px-4 py-3"><div className="flex items-center gap-3"><Thumbnail image={getImage(row)} alt={row.productName} small /><div className="min-w-0"><p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-900">{row.productName}</p><p className="mt-0.5 text-[10px] text-slate-400">{row.brand || "No brand"}</p></div></div></td>
                <td className="px-4 py-3"><SourceBadge item={row} /></td>
                <td className="max-w-52 px-4 py-3 text-xs text-slate-600">{row.models?.map((model) => model.model).join(", ") || "—"}</td>
                <td className="max-w-56 px-4 py-3"><p className="text-xs font-semibold text-slate-800">{row.designName}</p><p className="mt-1 text-[10px] font-bold text-blue-600">#{row.designNumber}</p></td>
                <td className="max-w-64 px-4 py-3"><code className="break-all text-[10px] font-bold text-slate-600">{row.sku}</code></td>
                <td className="whitespace-nowrap px-4 py-3"><p className="text-xs font-bold text-slate-900">{currency(row.price)}</p><p className="text-[10px] text-slate-400 line-through">{currency(row.mrp)}</p></td>
                <td className="px-4 py-3 text-xs font-bold text-slate-800">{Number(row.inventory || 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3"><StatusBadge mode={mode} /></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-1.5"><IconButton title="Edit all fields" onClick={() => onEdit(row)}><Edit3 size={14} /></IconButton>{mode === "drafts" && <IconButton title="Store in database" onClick={() => onStore(row)} disabled={saving} success>{saving ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}</IconButton>}<IconButton title={mode === "drafts" ? "Remove draft" : "Delete charm"} onClick={() => onDelete(row)} disabled={deletingId === row.id || saving} danger>{deletingId === row.id ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}</IconButton></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditDrawer({ editor, saving, onClose, onFieldChange, onModelsChange, onApplyDraft, onStoreDraft, onSaveStored }: { editor: { mode: WorkspaceTab; row: EditableRow }; saving: boolean; onClose: () => void; onFieldChange: (field: EditableField, value: string) => void; onModelsChange: (value: string) => void; onApplyDraft: () => void; onStoreDraft: () => void; onSaveStored: () => void }) {
  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" onClick={onClose} aria-label="Close editor" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col bg-[#f6f8fb] shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <SourceBadge item={editor.row} />
              <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${editor.mode === "drafts" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {editor.mode === "drafts" ? "Draft" : "Stored"}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900">Edit charm details</h2>
            <p className="mt-1 text-xs text-slate-500">Update listing information without changing the source product.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor" className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={17} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-900">Phone models</h3>
              <p className="mt-1 text-[11px] text-slate-500">Separate multiple models with commas.</p>
            </div>
            <textarea rows={2} value={editor.row.models?.map((model) => model.model).join(", ") || ""} onChange={(event) => onModelsChange(event.target.value)} className={textareaClass} placeholder="iPhone 13, iPhone 14" />
          </section>
          {FIELD_GROUPS.map((group) => <EditorGroup key={group.title} group={group} row={editor.row} onChange={onFieldChange} />)}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          {editor.mode === "drafts" ? (
            <>
              <button type="button" onClick={onApplyDraft} className={secondaryButtonClass}>Apply to Draft</button>
              <button type="button" onClick={onStoreDraft} disabled={saving} className={successButtonClass}>
                {saving ? <RefreshCw size={15} className="animate-spin" /> : <Database size={15} />}
                Store in Database
              </button>
            </>
          ) : (
            <button type="button" onClick={onSaveStored} disabled={saving} className={primaryButtonClass}>
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Edit3 size={15} />}
              Save Changes
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function EditorGroup({ group, row, onChange }: { group: FieldGroup; row: EditableRow; onChange: (field: EditableField, value: string) => void }) {
  const isImages = group.title === "Images";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
        <p className="mt-1 text-[11px] text-slate-500">{group.description}</p>
      </div>
      {isImages && <div className="mb-4 grid grid-cols-4 gap-2">{[row.image1, row.image2, row.image3, row.image4].map((image, index) => <div key={index} className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{image ? <img src={image} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon size={18} /></div>}</div>)}</div>}
      <div className="grid gap-3 sm:grid-cols-2">{group.fields.map((field) => <label key={field.key} className={field.multiline ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{field.label}</span>{field.multiline ? <textarea rows={field.key === "description" ? 4 : 2} value={String(row[field.key] ?? "")} readOnly={field.locked} onChange={(event) => onChange(field.key, event.target.value)} placeholder={field.placeholder} className={`${textareaClass} ${field.locked ? lockedClass : ""}`} /> : <input type={field.number ? "number" : "text"} value={String(row[field.key] ?? "")} readOnly={field.locked} onChange={(event) => onChange(field.key, event.target.value)} placeholder={field.placeholder} className={`${inputClass} ${field.locked ? lockedClass : ""}`} />}</label>)}</div>
    </section>
  );
}

function SourceBadge({ item }: { item: Product | EditableRow }) {
  const variant = sourceLabel(item).startsWith("Variant");
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${variant ? "bg-blue-50 text-blue-700" : "bg-slate-900 text-white"}`}>{sourceLabel(item)}</span>;
}

function StatusBadge({ mode }: { mode: WorkspaceTab }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${mode === "drafts" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{mode === "drafts" ? <Wand2 size={10} /> : <Check size={10} />}{mode === "drafts" ? "Draft" : "Stored"}</span>;
}

function Thumbnail({ image, alt, small = false }: { image: string; alt: string; small?: boolean }) {
  const size = small ? "h-11 w-11" : "h-20 w-20";
  return <div className={`${size} shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100`}>{image ? <img src={image} alt={alt} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><Package size={small ? 16 : 22} /></div>}</div>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 text-slate-400" size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100" /></div>;
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-500"}`}>{count}</span></button>;
}

function IconButton({ title, children, onClick, disabled = false, danger = false, success = false }: { title: string; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; success?: boolean }) {
  const color = danger ? "border-red-200 text-red-600 hover:bg-red-50" : success ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-slate-200 text-slate-600 hover:bg-slate-50";
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={`flex h-8 w-8 items-center justify-center rounded-lg border bg-white disabled:opacity-40 ${color}`}>{children}</button>;
}

function SectionTitle({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{step}</p>
      <h2 className="mt-1 font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </div>
  );
}

function Stat({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">{icon}</div>
      </div>
      <p className="mt-4 text-xs font-medium text-slate-400">{helper}</p>
    </div>
  );
}

function Notice({ tone, message, onClose }: { tone: "error" | "success"; message: string; onClose: () => void }) {
  const color = tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return <div className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${color}`}><p>{message}</p><button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-black/5"><X size={14} /></button></div>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400">{icon}</div><h3 className="font-bold text-slate-800">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p></div>;
}

function LoadingPage() {
  return <main className="min-h-screen bg-[#f6f8fb] p-6"><div className="mx-auto max-w-[1400px] animate-pulse space-y-5"><div className="h-24 rounded-2xl bg-white" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-white" />)}</div><div className="h-80 rounded-2xl bg-white" /></div></main>;
}

const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100";
const textareaClass = "w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-100";
const lockedClass = "cursor-not-allowed bg-slate-100 font-bold text-slate-500";
const secondaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-40";
const primaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-40";
const successButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40";
