class Item < ApplicationRecord
  belongs_to :list
  broadcasts_refreshes_to :list
end
