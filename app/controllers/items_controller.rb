class ItemsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_list
  before_action :set_item, only: [ :update, :destroy ]

  def create
    @item = @list.items.build(item_params)
    if @item.save
      redirect_to @list, status: :see_other
    else
      render turbo_stream: turbo_stream.update(
        "item_form_errors",
        partial: "items/errors",
        locals: { item: @item }
      ), status: :unprocessable_entity
    end
  end

  def update
    @item.update(item_params)
    redirect_to @list, status: :see_other
  end

  def destroy
    @item.destroy
    redirect_to @list, status: :see_other
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
