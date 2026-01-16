Rails.application.routes.draw do
  devise_for :users

  resources :lists do
    resources :items, only: [ :create, :update, :destroy ]
  end

  root "lists#index"

  get "up" => "rails/health#show", as: :rails_health_check
end
