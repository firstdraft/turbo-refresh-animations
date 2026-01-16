class Item < ApplicationRecord
  belongs_to :list
  broadcasts_refreshes_to :list

  validates :title, presence: true
end
