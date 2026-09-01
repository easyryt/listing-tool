"use client";

import {
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { PHONE_MODELS } from "@/lib/models";
import {
  FIXED_WRONG_DEFECTIVE_RETURN_DISCOUNT,
  getVariantPrice,
} from "@/lib/pricing";
import {
  BRANDS,
  CATEGORIES,
  COLORS,
  FINISHES,
  MATERIALS,
  PRINT_TYPES,
  PRODUCT_TYPES,
  THEMES,
} from "@/lib/options";
import type { Product } from "./ProductCard";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  "https://listing-tool-backend-b2xk.onrender.com/api"
).replace(/\/$/, "");

type EditorTab =
  | "basic"
  | "design"
  | "pricing"
  | "attributes"
  | "supply"
  | "images";

type EditorForm = {
  productName: string;
  description: string;
  brand: string;
  category: string;
  genericName: string;
  material: string;
  color: string;
  theme: string;
  type: string;
  price: string;
  wrongDefectiveReturnsPrice: string;
  mrp: string;
  gst: string;
  hsn: string;
  weight: string;
  inventory: string;
  country: string;
  manufacturer: string;
  manufacturerAddress: string;
  manufacturerPincode: string;
  packer: string;
  packerAddress: string;
  packerPincode: string;
  importer: string;
  importerAddress: string;
  importerPincode: string;
  size: string;
  quantity: string;
  length: string;
  width: string;
  designId: string;
  designName: string;
  designCode: string;
  designNumber: string;
  sku: string;
  styleId: string;
  printType: string;
  finish: string;
  version: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  groupId: string;
  models: string[];
};

type DesignOption = {
  id: string;
  designName: string;
  designCode: string;
};

type UpdateResponse = {
  success: boolean;
  message?: string;
  product: Product;
};

type Props = {
  product: Product;
  family: Product[];
  onClose: () => void;
  onSaved: (product: Product) => void | Promise<void>;
};

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "basic", label: "Basic & models" },
  { id: "design", label: "Design & SKU" },
  { id: "pricing", label: "Pricing & stock" },
  { id: "attributes", label: "Attributes" },
  { id: "supply", label: "Supply details" },
  { id: "images", label: "Images" },
];

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function text(value: unknown) {
  return value === undefined || value === null
    ? ""
    : String(value);
}

function numberText(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function productToForm(product: Product): EditorForm {
  const variantNumber = product.parentId
    ? product.variantNumber ?? product.version
    : 1;

  return {
    productName: text(product.productName),
    description: text(product.description),
    brand: text(product.brand),
    category: text(product.category),
    genericName: text(product.genericName),
    material: text(product.material),
    color: text(product.color),
    theme: text(product.theme),
    type: text(product.type),
    price: numberText(getVariantPrice(variantNumber)),
    wrongDefectiveReturnsPrice: numberText(
      FIXED_WRONG_DEFECTIVE_RETURN_DISCOUNT,
    ),
    mrp: numberText(product.mrp),
    gst: numberText(product.gst),
    hsn: text(product.hsn),
    weight: numberText(product.weight),
    inventory: numberText(product.inventory),
    country: text(product.country),
    manufacturer: text(product.manufacturer),
    manufacturerAddress: text(product.manufacturerAddress),
    manufacturerPincode: text(product.manufacturerPincode),
    packer: text(product.packer),
    packerAddress: text(product.packerAddress),
    packerPincode: text(product.packerPincode),
    importer: text(product.importer),
    importerAddress: text(product.importerAddress),
    importerPincode: text(product.importerPincode),
    size: text(product.size),
    quantity: numberText(product.quantity),
    length: numberText(product.length),
    width: numberText(product.width),
    designId: text(product.designId),
    designName: text(product.designName),
    designCode: text(product.designCode),
    designNumber: text(product.designNumber),
    sku: text(product.sku),
    styleId: text(product.styleId),
    printType: text(product.printType),
    finish: text(product.finish),
    version: text(product.version),
    image1: text(product.image1),
    image2: text(product.image2),
    image3: text(product.image3),
    image4: text(product.image4),
    groupId: text(product.groupId),
    models: Array.from(
      new Set(
        (product.models ?? [])
          .map((item) => text(item.model).trim())
          .filter(Boolean),
      ),
    ),
  };
}

function parseRequiredNumber(value: string, label: string) {
  const numeric = Number(value);

  if (!value.trim() || !Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a number of 0 or more.`);
  }

  return numeric;
}

async function updateProduct(id: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const result = (await response.json().catch(() => null)) as
    | UpdateResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(result?.message || "Unable to update this product.");
  }

  return (result as UpdateResponse).product;
}

export default function ProductEditorModal({
  product,
  family,
  onClose,
  onSaved,
}: Props) {
  const orderedFamily = useMemo(
    () =>
      [...family].sort((left, right) => {
        const leftVersion = Number(
          left.parentId ? left.variantNumber ?? left.version ?? 2 : 1,
        );
        const rightVersion = Number(
          right.parentId ? right.variantNumber ?? right.version ?? 2 : 1,
        );
        return leftVersion - rightVersion;
      }),
    [family],
  );

  const [activeProduct, setActiveProduct] = useState(product);
  const [form, setForm] = useState<EditorForm>(() =>
    productToForm(product),
  );
  const [tab, setTab] = useState<EditorTab>("basic");
  const [modelInput, setModelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [applySharedFields, setApplySharedFields] = useState(false);
  const [designs, setDesigns] = useState<DesignOption[]>([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [designsLoaded, setDesignsLoaded] = useState(false);

  const initialForm = useMemo(
    () => productToForm(activeProduct),
    [activeProduct],
  );
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const isVariant = Boolean(activeProduct.parentId);
  const standardVariants = orderedFamily.filter(
    (item) => item.parentId && (item.variantType ?? "standard") === "standard",
  );

  const setField = <Key extends keyof EditorForm>(
    field: Key,
    value: EditorForm[Key],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const loadDesigns = async () => {
    if (designsLoading || designsLoaded || isVariant) {
      return;
    }

    try {
      setDesignsLoading(true);
      const response = await fetch(`${API_BASE_URL}/designs?limit=250`, {
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as
        | { designs?: DesignOption[]; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.message || "Unable to load saved designs.");
      }

      setDesigns(Array.isArray(result?.designs) ? result.designs : []);
      setDesignsLoaded(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load saved designs.",
      );
    } finally {
      setDesignsLoading(false);
    }
  };

  const chooseProduct = (next: Product) => {
    if (next.id === activeProduct.id) {
      return;
    }

    if (dirty && !window.confirm("Discard the unsaved changes for this record?")) {
      return;
    }

    setActiveProduct(next);
    setForm(productToForm(next));
    setTab("basic");
    setModelInput("");
    setError("");
    setApplySharedFields(false);
  };

  const requestClose = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) {
      return;
    }

    onClose();
  };

  const addModel = () => {
    const model = modelInput.trim();

    if (!model) {
      return;
    }

    if (
      form.models.some(
        (current) => current.toLocaleLowerCase() === model.toLocaleLowerCase(),
      )
    ) {
      setModelInput("");
      return;
    }

    setField("models", [...form.models, model]);
    setModelInput("");
  };

  const removeModel = (model: string) => {
    setField(
      "models",
      form.models.filter((current) => current !== model),
    );
  };

  const selectDesign = (designId: string) => {
    const design = designs.find((item) => item.id === designId);

    if (!design) {
      return;
    }

    setForm((current) => ({
      ...current,
      designId: design.id,
      designName: design.designName,
      designCode: design.designCode,
    }));
  };

  const buildPayload = () => {
    const pricingVariantNumber = isVariant
      ? activeProduct.variantNumber ?? form.version
      : 1;

    const requiredStrings: Array<[string, string]> = [
      [form.productName, "Product Name"],
      [form.sku, "SKU"],
      [form.designName, "Design Name"],
      [form.designCode, "Design Code"],
      [form.designNumber, "Design Number"],
    ];

    for (const [value, label] of requiredStrings) {
      if (!value.trim()) {
        throw new Error(`${label} is required.`);
      }
    }

    if (!form.models.length) {
      throw new Error("Add at least one compatible model.");
    }

    return {
      productName: form.productName.trim(),
      description: form.description.trim(),
      brand: form.brand.trim(),
      category: form.category.trim(),
      genericName: form.genericName.trim(),
      material: form.material.trim(),
      color: form.color.trim(),
      theme: form.theme.trim(),
      type: form.type.trim(),
      price: getVariantPrice(pricingVariantNumber),
      wrongDefectiveReturnsPrice: FIXED_WRONG_DEFECTIVE_RETURN_DISCOUNT,
      mrp: parseRequiredNumber(form.mrp, "MRP"),
      gst: parseRequiredNumber(form.gst, "GST"),
      hsn: form.hsn.trim(),
      weight: parseRequiredNumber(form.weight, "Weight"),
      inventory: parseRequiredNumber(form.inventory, "Inventory"),
      country: form.country.trim(),
      manufacturer: form.manufacturer.trim(),
      manufacturerAddress: form.manufacturerAddress.trim(),
      manufacturerPincode: form.manufacturerPincode.trim(),
      packer: form.packer.trim(),
      packerAddress: form.packerAddress.trim(),
      packerPincode: form.packerPincode.trim(),
      importer: form.importer.trim(),
      importerAddress: form.importerAddress.trim(),
      importerPincode: form.importerPincode.trim(),
      size: form.size.trim(),
      quantity: parseRequiredNumber(form.quantity, "Quantity"),
      length: parseRequiredNumber(form.length, "Length"),
      width: parseRequiredNumber(form.width, "Width"),
      designId:
        isVariant || form.designId === initialForm.designId
          ? undefined
          : form.designId || null,
      designName: isVariant ? undefined : form.designName.trim(),
      designCode: isVariant ? undefined : form.designCode.trim().toUpperCase(),
      designNumber: isVariant ? undefined : form.designNumber.trim(),
      sku: form.sku.trim().toUpperCase(),
      styleId: form.styleId.trim().toUpperCase(),
      printType: form.printType.trim(),
      finish: form.finish.trim(),
      version: isVariant
        ? String(activeProduct.variantNumber ?? form.version).trim()
        : "1",
      image1: form.image1.trim(),
      image2: form.image2.trim(),
      image3: form.image3.trim(),
      image4: form.image4.trim(),
      groupId: form.groupId.trim(),
      models: form.models.map((model) => ({ model })),
    };
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = buildPayload();
      const updated = await updateProduct(activeProduct.id, payload);

      if (!isVariant) {
        const sharedPayload = applySharedFields
          ? {
              brand: payload.brand,
              category: payload.category,
              genericName: payload.genericName,
              material: payload.material,
              color: payload.color,
              theme: payload.theme,
              type: payload.type,
              gst: payload.gst,
              hsn: payload.hsn,
              weight: payload.weight,
              country: payload.country,
              manufacturer: payload.manufacturer,
              manufacturerAddress: payload.manufacturerAddress,
              manufacturerPincode: payload.manufacturerPincode,
              packer: payload.packer,
              packerAddress: payload.packerAddress,
              packerPincode: payload.packerPincode,
              importer: payload.importer,
              importerAddress: payload.importerAddress,
              importerPincode: payload.importerPincode,
              size: payload.size,
              quantity: payload.quantity,
              length: payload.length,
              width: payload.width,
              printType: payload.printType,
              finish: payload.finish,
              groupId: payload.groupId,
              models: payload.models,
            }
          : {};

        // A variant PATCH also refreshes the design fields inherited from its
        // parent. This keeps the V2+ records consistent after a parent edit.
        await Promise.all(
          standardVariants.map((variant) =>
            updateProduct(variant.id, sharedPayload),
          ),
        );
      }

      await onSaved(updated);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update this product.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-5">
      <button
        type="button"
        aria-label="Close product editor"
        onClick={requestClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
      />

      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-editor-title"
        className="relative z-10 flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f9fc] shadow-2xl"
      >
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="product-editor-title" className="truncate text-xl font-bold text-slate-950">
                  Edit product
                </h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                  {isVariant
                    ? `Variant V${activeProduct.variantNumber ?? activeProduct.version}`
                    : "Parent V1"}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">
                {activeProduct.productName}
              </p>
            </div>

            <button
              type="button"
              onClick={requestClose}
              aria-label="Close product editor"
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50"
            >
              <X size={18} />
            </button>
          </div>

          {orderedFamily.length > 1 ? (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {orderedFamily.map((item) => {
                const label = item.parentId
                  ? `V${item.variantNumber ?? item.version ?? "?"}`
                  : "V1 Parent";
                const selected = item.id === activeProduct.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => chooseProduct(item)}
                    title={item.productName}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      selected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 sm:px-5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                if (item.id === "design") {
                  void loadDesigns();
                }
              }}
              className={`shrink-0 border-b-2 px-3 py-3 text-xs font-bold transition ${
                tab === item.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <p>{error}</p>
              <button type="button" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          ) : null}

          {tab === "basic" ? (
            <EditorSection
              title="Basic information"
              description="Edit the listing title, description, brand, category and compatible models."
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <TextField
                  label="Product Name"
                  required
                  value={form.productName}
                  onChange={(value) => setField("productName", value)}
                  className="lg:col-span-2"
                />
                <TextAreaField
                  label="Product Description"
                  value={form.description}
                  onChange={(value) => setField("description", value)}
                  className="lg:col-span-2"
                />
                <TextField
                  label="Brand"
                  value={form.brand}
                  list="product-editor-brands"
                  onChange={(value) => {
                    const previousBrand = form.brand;
                    setForm((current) => ({
                      ...current,
                      brand: value,
                      manufacturer:
                        !current.manufacturer ||
                        current.manufacturer === previousBrand
                          ? value
                          : current.manufacturer,
                    }));
                  }}
                />
                <SelectField
                  label="Category"
                  value={form.category}
                  options={CATEGORIES}
                  onChange={(value) => {
                    const previousCategory = form.category;
                    setForm((current) => ({
                      ...current,
                      category: value,
                      genericName:
                        !current.genericName ||
                        current.genericName === previousCategory
                          ? value
                          : current.genericName,
                    }));
                  }}
                />
                <TextField
                  label="Generic Name"
                  value={form.genericName}
                  onChange={(value) => setField("genericName", value)}
                />
                <TextField
                  label="Country of Origin"
                  value={form.country}
                  onChange={(value) => setField("country", value)}
                />
              </div>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <FieldLabel label="Compatible Models" required />
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label="Add compatible model"
                    list="product-editor-models"
                    value={modelInput}
                    onChange={(event) => setModelInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addModel();
                      }
                    }}
                    placeholder="Search or type a model, then press Enter"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={addModel}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <Plus size={16} />
                    Add model
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.models.map((model) => (
                    <span
                      key={model}
                      className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"
                    >
                      {model}
                      <button
                        type="button"
                        onClick={() => removeModel(model)}
                        aria-label={`Remove ${model}`}
                        className="rounded-full p-0.5 hover:bg-blue-100"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {!form.models.length ? (
                    <p className="text-xs font-semibold text-red-600">
                      Add at least one compatible model.
                    </p>
                  ) : null}
                </div>
              </div>
            </EditorSection>
          ) : null}

          {tab === "design" ? (
            <EditorSection
              title="Design, SKU and family identity"
              description={
                isVariant
                  ? "Design fields are inherited from the V1 parent. The variant title, SKU, Style ID and version remain individually editable."
                  : "Choose a saved design or keep the current design, then edit the parent identity fields."
              }
            >
              {!isVariant ? (
                <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <FieldLabel label="Saved Design" />
                  <select
                    aria-label="Saved Design"
                    value={form.designId}
                    onFocus={() => void loadDesigns()}
                    onChange={(event) => selectDesign(event.target.value)}
                    disabled={designsLoading}
                    className={`${INPUT_CLASS} mt-2`}
                  >
                    <option value={form.designId}>
                      {form.designName && form.designCode
                        ? `${form.designName} — ${form.designCode}`
                        : "Current manual design"}
                    </option>
                    {designs
                      .filter((design) => design.id !== form.designId)
                      .map((design) => (
                        <option key={design.id} value={design.id}>
                          {design.designName} — {design.designCode}
                        </option>
                      ))}
                  </select>
                  <p className="mt-2 text-xs text-blue-700">
                    {designsLoading
                      ? "Loading saved designs…"
                      : "Selecting a design updates Design Name and Design Code together."}
                  </p>
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
                  To change Design Name, Design Code or Design Number for this
                  variant, edit its V1 parent. All standard V2+ variants are
                  synchronized when the parent is saved.
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <TextField
                  label="Design Name"
                  required
                  value={form.designName}
                  disabled={isVariant || Boolean(form.designId)}
                  onChange={(value) => setField("designName", value)}
                />
                <TextField
                  label="Design Code"
                  required
                  value={form.designCode}
                  disabled={isVariant || Boolean(form.designId)}
                  onChange={(value) => setField("designCode", value.toUpperCase())}
                />
                <TextField
                  label="Design Number"
                  required
                  value={form.designNumber}
                  disabled={isVariant}
                  onChange={(value) => setField("designNumber", value)}
                />
                <TextField
                  label="Group ID"
                  value={form.groupId}
                  onChange={(value) => setField("groupId", value)}
                />
                <TextField
                  label="SKU"
                  required
                  value={form.sku}
                  onChange={(value) => setField("sku", value.toUpperCase())}
                  className="lg:col-span-2"
                />
                <TextField
                  label="Product ID / Style ID"
                  value={form.styleId}
                  onChange={(value) => setField("styleId", value.toUpperCase())}
                />
                <TextField
                  label="Version"
                  value={form.version}
                  disabled
                  onChange={(value) => setField("version", value)}
                  help={
                    isVariant
                      ? `Relationship remains locked to V${activeProduct.variantNumber ?? "?"}.`
                      : "Parent relationship remains locked to V1."
                  }
                />
                <TextField
                  label="Print Type"
                  value={form.printType}
                  list="product-editor-print-types"
                  onChange={(value) => setField("printType", value)}
                />
                <TextField
                  label="Finish"
                  value={form.finish}
                  list="product-editor-finishes"
                  onChange={(value) => setField("finish", value)}
                />
              </div>
            </EditorSection>
          ) : null}

          {tab === "pricing" ? (
            <EditorSection
              title="Pricing and inventory"
              description="Update prices, tax, HSN and available stock for this exact record."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label="Selling Price" type="number" min="0" step="1" required disabled value={form.price} onChange={(value) => setField("price", value)} help="Automatically follows the ₹191–₹195 variant cycle." />
                <TextField label="Wrong/Defective Return Discount (₹)" type="number" min="0" step="1" disabled value={form.wrongDefectiveReturnsPrice} onChange={(value) => setField("wrongDefectiveReturnsPrice", value)} help="Fixed at ₹2 for every record." />
                <TextField label="MRP" type="number" min="0" step="0.01" required value={form.mrp} onChange={(value) => setField("mrp", value)} />
                <TextField label="GST %" type="number" min="0" step="0.01" required value={form.gst} onChange={(value) => setField("gst", value)} />
                <TextField label="HSN" value={form.hsn} onChange={(value) => setField("hsn", value)} />
                <TextField label="Inventory" type="number" min="0" step="1" required value={form.inventory} onChange={(value) => setField("inventory", value)} />
              </div>
            </EditorSection>
          ) : null}

          {tab === "attributes" ? (
            <EditorSection
              title="Product attributes and dimensions"
              description="Edit physical and merchandising attributes stored with this record."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField label="Material" value={form.material} list="product-editor-materials" onChange={(value) => setField("material", value)} />
                <TextField label="Color" value={form.color} list="product-editor-colors" onChange={(value) => setField("color", value)} />
                <TextField label="Theme" value={form.theme} list="product-editor-themes" onChange={(value) => setField("theme", value)} />
                <TextField label="Product Type" value={form.type} list="product-editor-types" onChange={(value) => setField("type", value)} />
                <TextField label="Size" value={form.size} onChange={(value) => setField("size", value)} />
                <TextField label="Quantity" type="number" min="0" step="1" required value={form.quantity} onChange={(value) => setField("quantity", value)} />
                <TextField label="Weight" type="number" min="0" step="0.01" required value={form.weight} onChange={(value) => setField("weight", value)} />
                <TextField label="Length" type="number" min="0" step="0.01" required value={form.length} onChange={(value) => setField("length", value)} />
                <TextField label="Width" type="number" min="0" step="0.01" required value={form.width} onChange={(value) => setField("width", value)} />
              </div>
            </EditorSection>
          ) : null}

          {tab === "supply" ? (
            <div className="space-y-5">
              <EditorSection title="Manufacturer" description="Manufacturer name and address details.">
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField label="Manufacturer Name" value={form.manufacturer} onChange={(value) => setField("manufacturer", value)} />
                  <TextField label="Manufacturer Pincode" value={form.manufacturerPincode} onChange={(value) => setField("manufacturerPincode", value)} />
                  <TextAreaField label="Manufacturer Address" value={form.manufacturerAddress} onChange={(value) => setField("manufacturerAddress", value)} className="lg:col-span-2" />
                </div>
              </EditorSection>
              <EditorSection title="Packer" description="Packer name and address details.">
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField label="Packer Name" value={form.packer} onChange={(value) => setField("packer", value)} />
                  <TextField label="Packer Pincode" value={form.packerPincode} onChange={(value) => setField("packerPincode", value)} />
                  <TextAreaField label="Packer Address" value={form.packerAddress} onChange={(value) => setField("packerAddress", value)} className="lg:col-span-2" />
                </div>
              </EditorSection>
              <EditorSection title="Importer" description="Importer name and address details.">
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField label="Importer Name" value={form.importer} onChange={(value) => setField("importer", value)} />
                  <TextField label="Importer Pincode" value={form.importerPincode} onChange={(value) => setField("importerPincode", value)} />
                  <TextAreaField label="Importer Address" value={form.importerAddress} onChange={(value) => setField("importerAddress", value)} className="lg:col-span-2" />
                </div>
              </EditorSection>
            </div>
          ) : null}

          {tab === "images" ? (
            <EditorSection
              title="Product images"
              description="Paste up to four image URLs. Empty fields remove the URL from this record."
            >
              <div className="grid gap-5 md:grid-cols-2">
                {(["image1", "image2", "image3", "image4"] as const).map(
                  (field, index) => (
                    <div key={field} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {form[field] ? (
                          <img src={form[field]} alt={`Product image ${index + 1}`} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-300">
                            <ImageIcon size={28} />
                          </div>
                        )}
                      </div>
                      <TextField label={`Image ${index + 1} URL`} type="url" value={form[field]} placeholder="https://..." onChange={(value) => setField(field, value)} />
                    </div>
                  ),
                )}
              </div>
            </EditorSection>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              {!isVariant && standardVariants.length ? (
                <label className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={applySharedFields}
                    onChange={(event) => setApplySharedFields(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <strong className="text-slate-800">Apply shared catalog fields to all {standardVariants.length} standard variants</strong>
                    <span className="mt-0.5 block text-slate-400">
                      Copies brand, category, attributes, tax, models and supply details. Variant titles, SKU, prices, stock and images stay unchanged.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-xs text-slate-400">
                  Parent and relationship IDs stay protected while editing.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !dirty}
                className="inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </footer>
      </form>

      <datalist id="product-editor-models">
        {PHONE_MODELS.map((model) => <option key={model} value={model} />)}
      </datalist>
      <Datalist id="product-editor-brands" values={BRANDS} />
      <Datalist id="product-editor-materials" values={MATERIALS} />
      <Datalist id="product-editor-colors" values={COLORS} />
      <Datalist id="product-editor-themes" values={THEMES} />
      <Datalist id="product-editor-types" values={PRODUCT_TYPES} />
      <Datalist id="product-editor-print-types" values={PRINT_TYPES} />
      <Datalist id="product-editor-finishes" values={FINISHES} />
    </div>
  );
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5">
        <h3 className="text-base font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      {label}
      {required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  list,
  min,
  step,
  placeholder,
  help,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "url";
  required?: boolean;
  disabled?: boolean;
  list?: string;
  min?: string;
  step?: string;
  placeholder?: string;
  help?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} required={required} />
      <input
        aria-label={label}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        list={list}
        min={min}
        step={step}
        placeholder={placeholder}
        className={`${INPUT_CLASS} mt-2`}
      />
      {help ? <p className="mt-1.5 text-[11px] text-slate-400">{help}</p> : null}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} />
      <textarea
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const normalizedOptions = options.includes(value)
    ? options
    : value
      ? [value, ...options]
      : options;

  return (
    <div>
      <FieldLabel label={label} />
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${INPUT_CLASS} mt-2`}>
        {!value ? <option value="">Select {label}</option> : null}
        {normalizedOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function Datalist({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {values.map((value) => <option key={value} value={value} />)}
    </datalist>
  );
}
