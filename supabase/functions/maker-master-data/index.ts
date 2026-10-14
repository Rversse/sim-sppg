import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

type IncomeSupplier = {
  id: string;
  business_name: string;
  owner_name: string | null;
  product_type: string | null;
};

function splitProductTypes(value: string | null) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default {
  fetch: withSupabase(
    { auth: "none" },
    async (_req, ctx) => {
      const { data: kitchens, error: kitchensError } = await ctx.supabaseAdmin
        .from("kitchens")
        .select("id,name,is_active,include_disbursement")
        .eq("is_active", true)
        .order("name");

      if (kitchensError) {
        return Response.json({ error: kitchensError.message }, { status: 500 });
      }

      const { data: accountRules, error: accountRulesError } = await ctx.supabaseAdmin
        .from("kitchen_account_rules")
        .select(`
          kitchen_id,
          account_id,
          flow_type,
          accounts(
            id,
            name,
            bank,
            account_number,
            supplier_id,
            account_category
          )
        `);

      if (accountRulesError) {
        return Response.json({ error: accountRulesError.message }, { status: 500 });
      }

      const { data: incomeSuppliers, error: incomeSuppliersError } = await ctx.supabaseAdmin
        .from("income_suppliers")
        .select("id,business_name,owner_name,product_type");

      if (incomeSuppliersError) {
        return Response.json({ error: incomeSuppliersError.message }, { status: 500 });
      }

      const incomeSupplierMap = new Map<string, IncomeSupplier>(
        (incomeSuppliers ?? []).map((supplier) => [supplier.id, supplier]),
      );

      const resolvedAccountRules = (accountRules ?? []).map((rule) => {
        const account = rule.accounts;
        const supplier = account?.supplier_id
          ? incomeSupplierMap.get(account.supplier_id) ?? null
          : null;

        return {
          kitchen_id: rule.kitchen_id,
          account_id: rule.account_id,
          flow_type: rule.flow_type,
          accounts: account,
          supplier: supplier
            ? {
                id: supplier.id,
                business_name: supplier.business_name,
                owner_name: supplier.owner_name,
                product_type: supplier.product_type,
                product_types: splitProductTypes(supplier.product_type),
              }
            : null,
        };
      });

      const { data: operationalAccounts, error: operationalAccountsError } = await ctx.supabaseAdmin
        .from("accounts")
        .select("id,name,bank,account_number,supplier_id,account_category")
        .eq("account_category", "holding")
        .order("name");

      if (operationalAccountsError) {
        return Response.json({ error: operationalAccountsError.message }, { status: 500 });
      }

      const { data: operationalRules, error: operationalRulesError } = await ctx.supabaseAdmin
        .from("kitchen_operational_account_rules")
        .select("id,kitchen_id,rule_type,owner_name,bank,account_number,is_active,mapping_status,target_role")
        .eq("is_active", true)
        .order("kitchen_id")
        .order("rule_type")
        .order("owner_name");

      if (operationalRulesError) {
        return Response.json({ error: operationalRulesError.message }, { status: 500 });
      }

      return Response.json({
        ok: true,
        kitchens: kitchens ?? [],
        account_rules: resolvedAccountRules,
        operational_accounts: operationalAccounts ?? [],
        operational_rules: operationalRules ?? [],
      });
    },
  ),
};
