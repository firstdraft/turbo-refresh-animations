class CreateItems < ActiveRecord::Migration[8.1]
  def change
    create_table :items do |t|
      t.string :title
      t.boolean :completed, default: false
      t.references :list, null: false, foreign_key: true

      t.timestamps
    end
  end
end
