'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('warehouse_movements', 'movement_kind', {
      type: Sequelize.ENUM('goods', 'materials', 'wip'),
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'ref_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'item_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'from_warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'to_warehouse_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'qty', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'moved_at', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn('warehouse_movements', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn('warehouse_movements', 'item_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.changeColumn('warehouse_movements', 'type', {
      type: Sequelize.ENUM('ПРИХОД', 'РАСХОД'),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('warehouse_movements', 'user_id');
    await queryInterface.removeColumn('warehouse_movements', 'moved_at');
    await queryInterface.removeColumn('warehouse_movements', 'qty');
    await queryInterface.removeColumn('warehouse_movements', 'to_warehouse_id');
    await queryInterface.removeColumn('warehouse_movements', 'from_warehouse_id');
    await queryInterface.removeColumn('warehouse_movements', 'item_name');
    await queryInterface.removeColumn('warehouse_movements', 'ref_id');
    await queryInterface.removeColumn('warehouse_movements', 'movement_kind');
    await queryInterface.changeColumn('warehouse_movements', 'item_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.changeColumn('warehouse_movements', 'type', {
      type: Sequelize.ENUM('ПРИХОД', 'РАСХОД'),
      allowNull: false,
    });
  },
};
