'use strict';

module.exports = {
  async up(queryInterface) {
    const addIndexSafe = async (table, fields, name) => {
      try {
        await queryInterface.addIndex(table, fields, { name });
        console.log(`[Migration] Индекс добавлен: ${name}`);
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('relation') && msg.includes('already')
        ) {
          console.log(`[Migration] Индекс уже есть: ${name}`);
          return;
        }
        throw err;
      }
    };

    const defs = [
      ['audit_logs', ['created_at']],
      ['building_floors', ['created_at']],
      ['clients', ['created_at']],
      ['colors', ['created_at']],
      ['cutting_documents', ['status'], ['order_id'], ['created_at']],
      ['cutting_fact_details', ['created_at']],
      ['cutting_tasks', ['status'], ['order_id'], ['created_at']],
      ['cutting_types', ['created_at']],
      ['finance_categories', ['created_at']],
      ['finance_fact', ['order_id'], ['created_at']],
      ['finance_plan_2026', ['created_at']],
      ['floors', ['created_at']],
      ['model_sizes', ['created_at']],
      ['operations', ['created_at']],
      ['orders', ['created_at'], ['workshop_id']],
      ['order_comments', ['order_id'], ['created_at']],
      ['order_finance_link', ['order_id'], ['created_at']],
      ['order_floor_distributions', ['order_id'], ['created_at']],
      ['order_operations', ['status'], ['order_id'], ['created_at']],
      ['order_operation_variants', ['created_at']],
      ['order_parts', ['status'], ['order_id'], ['created_at']],
      ['order_rostovka', ['order_id'], ['created_at']],
      ['order_size_matrix', ['order_id'], ['created_at']],
      ['order_stages', ['status'], ['order_id'], ['created_at']],
      ['order_status', ['created_at']],
      ['order_variants', ['order_id'], ['created_at']],
      ['otk_documents', ['status'], ['order_id'], ['created_at']],
      ['otk_fact_details', ['created_at']],
      ['otk_warehouse_items', ['status'], ['order_id'], ['created_at']],
      ['planning_chains', ['order_id'], ['created_at']],
      ['planning_draft_cells', ['created_at']],
      ['planning_matrix_snapshots', ['created_at'], ['workshop_id']],
      ['planning_month_facts', ['order_id'], ['created_at']],
      ['planning_periods', ['status'], ['created_at']],
      ['planning_production_drafts', ['created_at']],
      ['procurement_items', ['created_at']],
      ['procurement_requests', ['status'], ['order_id'], ['created_at']],
      ['production_calendar', ['created_at']],
      ['production_cycle_settings', ['created_at']],
      ['production_plan_day', ['order_id'], ['created_at'], ['workshop_id']],
      ['models', ['created_at']],
      ['purchase_documents', ['status'], ['order_id'], ['created_at']],
      ['qc_batches', ['status'], ['created_at']],
      ['qc_batch_items', ['created_at']],
      ['qc_records', ['order_id'], ['created_at']],
      ['sewers', ['created_at']],
      ['sewing_batches', ['status'], ['order_id'], ['created_at']],
      ['sewing_batch_items', ['created_at']],
      ['sewing_documents', ['status'], ['order_id'], ['created_at']],
      ['sewing_fact', ['order_id'], ['created_at']],
      ['sewing_fact_details', ['created_at']],
      ['sewing_fact_matrix', ['order_id'], ['created_at']],
      ['sewing_order_floors', ['status'], ['order_id'], ['created_at']],
      ['sewing_plans', ['order_id'], ['created_at']],
      ['sewing_plan_rows', ['order_id'], ['created_at']],
      ['sewing_records', ['order_id'], ['created_at']],
      ['shipments', ['status'], ['order_id'], ['created_at']],
      ['shipment_items', ['created_at']],
      ['shipping_documents', ['status'], ['order_id'], ['created_at']],
      ['sizes', ['created_at']],
      ['sync_queue', ['status'], ['created_at']],
      ['technologists', ['created_at']],
      ['users', ['created_at']],
      ['warehouse_items', ['created_at']],
      ['warehouse_movements', ['order_id'], ['created_at']],
      ['warehouse_stock', ['order_id'], ['created_at']],
      ['weekly_capacity', ['created_at'], ['workshop_id']],
      ['weekly_carry', ['created_at'], ['workshop_id']],
      ['weekly_plans', ['created_at'], ['workshop_id']],
      ['workshops', ['created_at']],
    ];

    for (const [table, ...fieldSets] of defs) {
      for (const fields of fieldSets) {
        const name = `idx_${table}_${fields.join('_')}`;
        await addIndexSafe(table, fields, name);
      }
    }
  },

  async down(queryInterface) {
    const removeIndexSafe = async (table, name) => {
      try {
        await queryInterface.removeIndex(table, name);
      } catch (err) {
        console.log(`[Migration] Не удалось удалить: ${name}`);
      }
    };

    const defs = [
      ['audit_logs', ['created_at']],
      ['building_floors', ['created_at']],
      ['clients', ['created_at']],
      ['colors', ['created_at']],
      ['cutting_documents', ['status'], ['order_id'], ['created_at']],
      ['cutting_fact_details', ['created_at']],
      ['cutting_tasks', ['status'], ['order_id'], ['created_at']],
      ['cutting_types', ['created_at']],
      ['finance_categories', ['created_at']],
      ['finance_fact', ['order_id'], ['created_at']],
      ['finance_plan_2026', ['created_at']],
      ['floors', ['created_at']],
      ['model_sizes', ['created_at']],
      ['operations', ['created_at']],
      ['orders', ['created_at'], ['workshop_id']],
      ['order_comments', ['order_id'], ['created_at']],
      ['order_finance_link', ['order_id'], ['created_at']],
      ['order_floor_distributions', ['order_id'], ['created_at']],
      ['order_operations', ['status'], ['order_id'], ['created_at']],
      ['order_operation_variants', ['created_at']],
      ['order_parts', ['status'], ['order_id'], ['created_at']],
      ['order_rostovka', ['order_id'], ['created_at']],
      ['order_size_matrix', ['order_id'], ['created_at']],
      ['order_stages', ['status'], ['order_id'], ['created_at']],
      ['order_status', ['created_at']],
      ['order_variants', ['order_id'], ['created_at']],
      ['otk_documents', ['status'], ['order_id'], ['created_at']],
      ['otk_fact_details', ['created_at']],
      ['otk_warehouse_items', ['status'], ['order_id'], ['created_at']],
      ['planning_chains', ['order_id'], ['created_at']],
      ['planning_draft_cells', ['created_at']],
      ['planning_matrix_snapshots', ['created_at'], ['workshop_id']],
      ['planning_month_facts', ['order_id'], ['created_at']],
      ['planning_periods', ['status'], ['created_at']],
      ['planning_production_drafts', ['created_at']],
      ['procurement_items', ['created_at']],
      ['procurement_requests', ['status'], ['order_id'], ['created_at']],
      ['production_calendar', ['created_at']],
      ['production_cycle_settings', ['created_at']],
      ['production_plan_day', ['order_id'], ['created_at'], ['workshop_id']],
      ['models', ['created_at']],
      ['purchase_documents', ['status'], ['order_id'], ['created_at']],
      ['qc_batches', ['status'], ['created_at']],
      ['qc_batch_items', ['created_at']],
      ['qc_records', ['order_id'], ['created_at']],
      ['sewers', ['created_at']],
      ['sewing_batches', ['status'], ['order_id'], ['created_at']],
      ['sewing_batch_items', ['created_at']],
      ['sewing_documents', ['status'], ['order_id'], ['created_at']],
      ['sewing_fact', ['order_id'], ['created_at']],
      ['sewing_fact_details', ['created_at']],
      ['sewing_fact_matrix', ['order_id'], ['created_at']],
      ['sewing_order_floors', ['status'], ['order_id'], ['created_at']],
      ['sewing_plans', ['order_id'], ['created_at']],
      ['sewing_plan_rows', ['order_id'], ['created_at']],
      ['sewing_records', ['order_id'], ['created_at']],
      ['shipments', ['status'], ['order_id'], ['created_at']],
      ['shipment_items', ['created_at']],
      ['shipping_documents', ['status'], ['order_id'], ['created_at']],
      ['sizes', ['created_at']],
      ['sync_queue', ['status'], ['created_at']],
      ['technologists', ['created_at']],
      ['users', ['created_at']],
      ['warehouse_items', ['created_at']],
      ['warehouse_movements', ['order_id'], ['created_at']],
      ['warehouse_stock', ['order_id'], ['created_at']],
      ['weekly_capacity', ['created_at'], ['workshop_id']],
      ['weekly_carry', ['created_at'], ['workshop_id']],
      ['weekly_plans', ['created_at'], ['workshop_id']],
      ['workshops', ['created_at']],
    ];

    for (const [table, ...fieldSets] of defs) {
      for (const fields of fieldSets) {
        const name = `idx_${table}_${fields.join('_')}`;
        await removeIndexSafe(table, name);
      }
    }
  },
};
