class ItemsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_list
  before_action :set_item, only: [ :update, :destroy ]

  def create
    @item = @list.items.build(item_params)
    if @item.save
      redirect_to @list
    else
      redirect_to @list, alert: "Could not add item."
    end
  end

  def update
    @item.update(item_params)
    redirect_to @list
  end

  def destroy
    @item.destroy
    redirect_to @list
  end

  private

  def set_list
    @list = current_user.lists.find(params[:list_id])
  end

  def set_item
    @item = @list.items.find(params[:id])
  end

  def item_params
    params.require(:item).permit(:title, :completed)
  end
end
