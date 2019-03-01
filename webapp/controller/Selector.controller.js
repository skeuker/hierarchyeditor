/*global history */
sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"pnp/hierarchyeditor/util/Formatter",
	"sap/m/StandardListItem"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Formatter, StandardListItem) {
	"use strict";

	return BaseController.extend("pnp.hierarchyeditor.controller.Selector", {

		formatter: Formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit: function () {

			//local data declaration
			this.oSelectorList = this.byId("SelectorList");
			var iOriginalBusyDelay = this.oSelectorList.getBusyIndicatorDelay();
				
			//keep track of filter and search state
			this.oSelectorListFilterState = {
				aFilter: [],
				aSearch: []
			};

			//create view model	
			this.oViewModel = this.createSelectorViewModel();

			//set view model to view
			this.setModel(this.oViewModel, "SelectorViewModel");

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			this.oSelectorList.attachEventOnce("updateFinished", function () {

				// Restore original busy indicator delay for the list
				this.oViewModel.setProperty("/delay", iOriginalBusyDelay);

			}.bind(this));

			//keep track of selector list for access from detail controller
			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(this.oSelectorList);
				}.bind(this)
			});

			//keep track of OData model
			this.oHierarchyModel = this.getOwnerComponent().getModel("HierarchyModel");

			//register event handler for view display
			this.getRouter().getTarget("Selector").attachDisplay(this.onDisplay, this);
			this.getRouter().attachBypassed(this.onBypassed, this);

			//keep track that for now master controller is leading view controller
			this.getOwnerComponent().oLeadingViewController = this;

		},
		
		//handler for view display event
		onDisplay: function () {

			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("SelectorViewModel").setProperty("/layout", "OneColumn");

			//bind master list 'items' aggregation to OData content
			this.getView().byId("SelectorList").bindAggregation("items", {

				//path to OData 
				path: "HierarchyModel>/Hierarchies",

				//group header factory
				groupHeaderFactory: this.createGroupHeader,

				//factory function
				factory: this.createSelectorListItem.bind(this)

			});

		},
		
		//create selector list item
		createSelectorListItem: function (sId, oBindingContext) {
			
			//get hierarchy
			var oHierarchy = oBindingContext.getObject();

			//create standard list item with this Binding
			return new StandardListItem({
				type: "Navigation",
				title: oHierarchy.HierarchyText
			});

		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange: function (oEvent) {

			//local data declaration
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === "MultiSelect" && !bSelected)) {

				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this.showHierarchyEditor(oEvent.getParameter("listItem") || oEvent.getSource());

			}

		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished: function (oEvent) {

			// update the master list object counter after new data is loaded
			this.updateListItemCount(oEvent.getParameter("total"));

		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch: function (oEvent) {

			//refresh search button called
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this.oSelectorListFilterState.aSearch = [new Filter("TopicID", FilterOperator.Contains, sQuery)];
			} else {
				this.oSelectorListFilterState.aSearch = [];
			}
			this.applyFilterSearch();

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh: function () {
			this.oSelectorList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the button press event
		 * @public
		 */
		onOpenViewSettings: function (oEvent) {
			if (!this.oViewSettingsDialog) {
				this.oViewSettingsDialog = sap.ui.xmlfragment("pnp.survey.view.ViewSettingsDialog", this);
				this.getView().addDependent(this.oViewSettingsDialog);
				// forward compact/cozy style into Dialog
				this.oViewSettingsDialog.addStyleClass(this.getOwnerComponent().getContentDensityClass());
			}
			var sDialogTab = "sort";

			this.oViewSettingsDialog.open(sDialogTab);
		},

		/**
		 * Event handler called when ViewSettingsDialog has been confirmed, i.e.
		 * has been closed with 'OK'. In the case, the currently chosen filters, sorters or groupers
		 * are applied to the master list, which can also mean that they
		 * are removed from the master list, in case they are
		 * removed in the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @public
		 */
		onConfirmViewSettingsDialog: function (oEvent) {

			this.applySortGroup(oEvent);
			
		},

		/**
		 * Apply the chosen sorter and grouper to the master list
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @private
		 */
		applySortGroup: function (oEvent) {
			var mParams = oEvent.getParameters(),
				sPath,
				bDescending,
				aSorters = [];
			sPath = mParams.sortItem.getKey();
			bDescending = mParams.sortDescending;
			aSorters.push(new Sorter(sPath, bDescending));
			this.oSelectorList.getBinding("items").sort(aSorters);
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed: function () {
			this.oSelectorList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		createGroupHeader: function (oGroup) {
			return new GroupHeaderListItem({
				title: oGroup.text,
				upperCase: false
			});
		},

		/**
		 * Event handler for navigating back.
		 * We navigate back in the browser historz
		 * @public
		 */
		onNavBack: function () {
			history.go(-1);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		//create view model to control UI behaviour
		createSelectorViewModel: function () {
			return new JSONModel({
				filterBarLabel: "",
				isFilterBarVisible: false,
				ViewTitle: this.getResourceBundle().getText("SelectorViewTitle", [0]),
				sortBy: "HierarchyText",
				groupBy: "None",
				delay: 0
			});
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		showHierarchyEditor: function (oItem) {

			//get requested hierarchy 
			var oHierarchy = oItem.getBindingContext("HierarchyModel").getObject();

			//display detail corresponding to the hierarchy
			this.getRouter().getTargets().display("Hierarchy", {
				HierarchyID: oHierarchy.HierarchyID
			});

		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		updateListItemCount: function (iTotalItems) {

			// only update the counter if the length is final
			if (this.oSelectorList.getBinding("items").isLengthFinal()) {
				var sTitle = this.getResourceBundle().getText("SelectorViewTitle", [iTotalItems]);
				this.getModel("SelectorViewModel").setProperty("/ViewTitle", sTitle);
			}

		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		applyFilterSearch: function () {
			var aFilters = this.oSelectorListFilterState.aSearch.concat(this.oSelectorListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this.oSelectorList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this.oSelectorListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		/**
		 * Internal helper method that sets the filter bar visibility property and the label's caption to be shown
		 * @param {string} sFilterBarText the selected filter value
		 * @private
		 */
		updateFilterBar: function (sFilterBarText) {
			var oViewModel = this.getModel("SelectorViewModel");
			oViewModel.setProperty("/isFilterBarVisible", (this.oSelectorListFilterState.aFilter.length > 0));
			oViewModel.setProperty("/filterBarLabel", this.getResourceBundle().getText("SelectorFilterBarText", [sFilterBarText]));
		},

		//controller decision whether to delegate OData service error handling
		delegatesODataErrorHandling: function (sStatusCode) {

			//all OData service error handling delegated to ErrorHandler.js
			return true;

		}

	});

});