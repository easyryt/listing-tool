"use client";

import { ImageUp, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { PHONE_MODELS } from "@/lib/models";
import {
  CATEGORIES,
  PRODUCT_TYPES,
  THEMES,
} from "@/lib/options";

export type GeneratedProductDetails = {
  title: string;
  color: string;
  material: string;
  designName: string;
  designCode: string;
  designId: string;
  imageUrl: string;
  thumbnailUrl: string;
};

type Props = {
  category: string;
  model: string;
  theme: string;
  productType: string;
  usedDesignCodes: string[];
  onCategoryChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onThemeChange: (value: string) => void;
  onProductTypeChange: (value: string) => void;
  onGenerated: (data: GeneratedProductDetails) => void;
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export default function AiProductScanner({
  category,
  model,
  theme,
  productType,
  usedDesignCodes,
  onCategoryChange,
  onModelChange,
  onThemeChange,
  onProductTypeChange,
  onGenerated,
}: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const selectImage = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      alert("Please select an image smaller than 10 MB.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const analyzeImage = async () => {
    if (!image) {
      alert("Upload a product image first.");
      return;
    }

    if (!category?.trim()) {
      alert("Please select a category first.");
      return;
    }

    if (!model?.trim()) {
      alert("Please select one phone model first.");
      return;
    }

    if (!theme?.trim()) {
      alert("Please select a theme first.");
      return;
    }

    if (!productType?.trim()) {
      alert("Please select a product type first.");
      return;
    }

    try {
      setLoading(true);

      const body = new FormData();

      body.append("image", image);
      body.append("category", category);
      body.append("model", model);
      body.append("theme", theme);
      body.append("productType", productType);
      body.append("usedDesignCodes", JSON.stringify(usedDesignCodes));
      body.append("titleCount", "1");

      const response = await fetch("/api/ai/product-copy", {
        method: "POST",
        body,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to analyze image.");
      }

      const generatedTitle = Array.isArray(result.titleOptions)
        ? result.titleOptions
            .map((title: unknown) => String(title || "").trim())
            .find(Boolean)
        : "";

      if (!generatedTitle) {
        throw new Error("AI did not return a product title. Please try again.");
      }

      const productDetails: GeneratedProductDetails = {
        title: generatedTitle,
        color: String(result.color || ""),
        material: String(result.material || "Not specified"),
        designName: String(result.designName || ""),
        designCode: String(result.designCode || "DESIGN")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 8),
        designId: String(result.designId || ""),
        imageUrl: String(result.imageUrl || ""),
        thumbnailUrl: String(result.thumbnailUrl || ""),
      };

      if (
        !productDetails.designId ||
        !productDetails.imageUrl
      ) {
        throw new Error(
          "The design was generated but was not stored completely. Please try again.",
        );
      }

      onGenerated(productDetails);

      alert(
        "Design generated, uploaded to ImageKit, and saved in the design library.",
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Unable to analyze the product image.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Sparkles size={18} />
            </span>
            <h2 className="font-bold text-slate-900">
              AI product assistant
            </h2>
          </div>

          <p className="mt-1 text-sm text-slate-600">
            Select category, model, theme, and product type first. Then upload
            the design image to generate the title, a 2–3 word Design Name and a Design Code of no more than 8 letters. AI will not generate a description.
          </p>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
          <ImageUp size={18} />
          Upload image

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => selectImage(event.target.files?.[0])}
          />
        </label>
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-900">AI generation settings</p>
          <p className="mt-1 text-xs text-slate-600">
            You can change these selections here before uploading or generating.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <AssistantSelect
            label="Category"
            value={category}
            options={CATEGORIES}
            onChange={onCategoryChange}
          />

          <AssistantSelect
            label="Phone model"
            value={model}
            options={PHONE_MODELS}
            onChange={onModelChange}
          />

          <AssistantSelect
            label="Theme"
            value={theme}
            options={THEMES}
            onChange={onThemeChange}
          />

          <AssistantSelect
            label="Product type"
            value={productType}
            options={PRODUCT_TYPES}
            onChange={onProductTypeChange}
          />
        </div>
      </div>

      {previewUrl && (
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div
            role="img"
            aria-label="Product image preview"
            style={{
              backgroundImage: `url(${JSON.stringify(previewUrl)})`,
            }}
            className="h-32 w-32 shrink-0 rounded-xl border border-slate-200 bg-slate-50 bg-cover bg-center bg-no-repeat"
          />

          <div>
            <p className="break-all font-medium text-slate-800">{image?.name}</p>

            <p className="mt-1 text-sm text-slate-500">
              AI will use the selected phone model and product details, not
              guess them from the image.
            </p>

            <button
              type="button"
              onClick={analyzeImage}
              disabled={loading}
              className="mt-3 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analyzing and saving...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generate and save design
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </section>
  );
}

function AssistantSelect({
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
  const selectableOptions = value && !options.includes(value)
    ? [value, ...options]
    : options;

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {!value ? <option value="">Select {label.toLowerCase()}</option> : null}
        {selectableOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
