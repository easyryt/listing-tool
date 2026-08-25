"use client";

import {
  useEffect,
  useRef,
} from "react";
import type {
  Control,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useController } from "react-hook-form";

import { BRANDS, CATEGORIES } from "../../lib/options";
import type { FormData } from "./ProductCard";

type Props = {
  register: UseFormRegister<FormData>;
  control: Control<FormData>;
  setValue: UseFormSetValue<FormData>;
  generatedProductTitle: string;
};

export default function BasicInfo({
  register,
  control,
  setValue,
  generatedProductTitle,
}: Props) {
  const { field: productNameField } =
    useController({
      name: "productName",
      control,
    });
  const lastAppliedTitle =
    useRef("");

  useEffect(() => {
    const title =
      generatedProductTitle.trim();

    if (!title) {
      return;
    }

    if (
      lastAppliedTitle.current ===
      title
    ) {
      return;
    }

    lastAppliedTitle.current =
      title;

    setValue(
      "productName",
      title,
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
    productNameField.onChange(
      title,
    );
  }, [
    generatedProductTitle,
    productNameField,
    setValue,
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Product Name */}

      <div className="md:col-span-2">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Product Name
        </label>

        <input
          {...productNameField}
          value={
            productNameField.value ||
            generatedProductTitle ||
            ""
          }
          placeholder="iPhone 15 Premium Crystal Clear Silicon Back Cover..."
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />

        {generatedProductTitle ? (
          <p className="mt-2 text-xs font-medium text-emerald-700">
            Auto title: {generatedProductTitle}
          </p>
        ) : null}
      </div>

      {/* Brand */}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Brand
        </label>

        <select
          {...register("brand")}
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
        >
          {BRANDS.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      {/* Category */}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Category
        </label>

        <select
          {...register("category")}
          className="w-full rounded-xl border border-slate-300 px-4 py-3"
        >
          {CATEGORIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
