type Props = {
  register: any;
};

export default function PricingDetails({
  register,
}: Props) {
  return (
    <div className="mt-8">

      <h3 className="mb-5 text-lg font-semibold text-slate-900">
        Pricing & Inventory
      </h3>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

        {/* Price */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            Meesho Price
          </label>

          <input
            type="number"
            {...register("price", {
              valueAsNumber: true,
            })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* MRP */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            MRP
          </label>

          <input
            type="number"
            {...register("mrp", {
              valueAsNumber: true,
            })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* GST */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            GST %
          </label>

          <input
            type="number"
            {...register("gst", {
              valueAsNumber: true,
            })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* HSN */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            HSN
          </label>

          <input
            {...register("hsn")}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* Weight */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            Weight (g)
          </label>

          <input
            type="number"
            {...register("weight", {
              valueAsNumber: true,
            })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* Inventory */}

        <div>
          <label className="mb-2 block text-sm font-medium">
            Inventory
          </label>

          <input
            type="number"
            {...register("inventory", {
              valueAsNumber: true,
            })}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

        {/* Country */}

        <div className="md:col-span-3">
          <label className="mb-2 block text-sm font-medium">
            Country of Origin
          </label>

          <input
            {...register("country")}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </div>

      </div>

    </div>
  );
}