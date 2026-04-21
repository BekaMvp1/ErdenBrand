'use strict';

const {
  safeAddIndex,
  safeCreateIndexQuery,
  addColumnIfMissing,
  safeAddConstraint,
  bulkInsertIfCountZero,
} = require('../utils/migrationHelpers');


/**
 * Миграция: справочник этажей (для распределения заказов)
 * Отдельная таблица от цехов пошива
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('building_floors', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    const cols_technologists = await queryInterface.describeTable('technologists');
    if (!cols_technologists.building_floor_id) {
      await addColumnIfMissing(queryInterface, 'technologists', 'building_floor_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    const existingFloors = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS cnt FROM building_floors',
      { type: Sequelize.QueryTypes.SELECT },
    );
    if (existingFloors.length && Number(existingFloors[0].cnt) > 0) {
      // данные уже есть — пропустить
    } else {
      const [floors] = await queryInterface.sequelize.query(
        'SELECT id, name, created_at, updated_at FROM floors ORDER BY id',
      );
      if (floors && floors.length > 0) {
        await bulkInsertIfCountZero(queryInterface, 'building_floors', floors.map((f) => ({
          name: f.name,
          created_at: f.created_at,
          updated_at: f.updated_at,
        })));
        for (let i = 0; i < floors.length; i++) {
          await queryInterface.sequelize.query(
            'UPDATE technologists SET building_floor_id = :bfId WHERE floor_id = :fId',
            { replacements: { bfId: i + 1, fId: floors[i].id } },
          );
        }
      } else {
        await bulkInsertIfCountZero(queryInterface, 'building_floors', [
          { name: 'Этаж 1', created_at: new Date(), updated_at: new Date() },
          { name: 'Этаж 2', created_at: new Date(), updated_at: new Date() },
          { name: 'Этаж 3', created_at: new Date(), updated_at: new Date() },
          { name: 'Этаж 4', created_at: new Date(), updated_at: new Date() },
        ]);
      }
    }

    const cols_orders = await queryInterface.describeTable('orders');
    if (!cols_orders.building_floor_id) {
      await addColumnIfMissing(queryInterface, 'orders', 'building_floor_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    const cols_order_floor_distributions = await queryInterface.describeTable(
      'order_floor_distributions',
    );
    if (!cols_order_floor_distributions.building_floor_id) {
      await addColumnIfMissing(queryInterface, 'order_floor_distributions', 'building_floor_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'building_floors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    await queryInterface.changeColumn('order_floor_distributions', 'floor_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('order_floor_distributions', 'building_floor_id');
    await queryInterface.removeColumn('orders', 'building_floor_id');
    await queryInterface.removeColumn('technologists', 'building_floor_id');
    await queryInterface.dropTable('building_floors');
  },
};
