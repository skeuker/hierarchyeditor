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
], function(BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem, Device, Formatter, StandardListItem) {
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
		onInit: function() {

			//local data declaration
			this.oSelectorList = this.byId("SelectorList");
			var iOriginalBusyDelay = this.oSelectorList.getBusyIndicatorDelay();

			//get resource bundle
			this.oResourceBundle = this.getResourceBundle();

			//create view model	
			this.oViewModel = this.createSelectorViewModel();

			//prepare message handling
			this.oMessageStrip = this.getView().byId("msSelectorMessageStrip");
			if (this.oMessageStrip) {
				this.oMessageStrip.setVisible(false);
			}

			//set view model to view
			this.setModel(this.oViewModel, "SelectorViewModel");

			//register this view model on component
			this.getOwnerComponent().setModel(this.oViewModel, "SelectorViewModel");

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			this.oSelectorList.attachEventOnce("updateFinished", function() {

				// Restore original busy indicator delay for the list
				this.oViewModel.setProperty("/delay", iOriginalBusyDelay);

			}.bind(this));

			//keep track of selector list for access from detail controller
			this.getView().addEventDelegate({
				onBeforeFirstShow: function() {
					this.getOwnerComponent().oListSelector.setBoundMasterList(this.oSelectorList);
				}.bind(this)
			});

			//initiate interaction with message manager	
			this.oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.oMessageManager.registerMessageProcessor(this.oMessageProcessor);
			this.getView().setModel(this.oMessageManager.getMessageModel(), "MessageModel");

			//keep track of OData model
			this.oHierarchyModel = this.getOwnerComponent().getModel("HierarchyModel");

			//register event handler for view display
			this.getRouter().getTarget("Selector").attachDisplay(this.onDisplay, this);
			this.getRouter().attachBypassed(this.onBypassed, this);

		},

		//handler for view display event
		onDisplay: function() {

			//prepare view for next action			
			this.prepareViewForNextAction();

			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("SelectorViewModel").setProperty("/layout", "OneColumn");

			//bind master list 'items' aggregation to OData content
			this.getView().byId("SelectorList").bindAggregation("items", {

				//path to OData hierarchy entities
				path: "HierarchyModel>/Hierarchies",
				
				//sorter
				sorters: new Sorter("HierarchyText", false),

				//expand parameters
				parameters: {
					"expand": "toMetadata",
					"operationMode": "Client"
				},

				//group header factory
				groupHeaderFactory: this.createGroupHeader,

				//factory function
				factory: this.createSelectorListItem.bind(this)

			});

		},

		//create selector list item
		createSelectorListItem: function(sId, oBindingContext) {

			//get hierarchy
			var oHierarchy = oBindingContext.getObject();

			//create standard list item with this Binding
			return new StandardListItem({
				type: "Navigation",
				title: "{HierarchyModel>HierarchyText}",
				description: "{HierarchyModel>toMetadata/HierarchyTypeText}"
			});

		},

		//prepare view for next action
		prepareViewForNextAction: function() {

			//hide message strip 
			this.oMessageStrip.setVisible(false);

			//remove all messages from the message manager
			this.oMessageManager.removeAllMessages();

			//set this view as leading view in the application
			this.setAsLeadingView();

		},

		//set current view als leading view in this application
		setAsLeadingView: function() {

			//set this view as leading view
			this.getOwnerComponent().getModel("SelectorViewModel").setProperty("/isLeadingView", true);

			//demote other views in this application
			this.getOwnerComponent().getModel("HierarchyViewModel").setProperty("/isLeadingView", false);

			//where attributes model is already instantiated
			var oAttributesViewModel = this.getOwnerComponent().getModel("AttributesViewModel");
			if (oAttributesViewModel) {
				oAttributesViewModel.setProperty("/isLeadingView", false);
			}

		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange: function(oEvent) {

			//prepare view for next action			
			this.prepareViewForNextAction();

			//local data declaration
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			//change flexible column layout to hide attributes view where previously opened
			this.getModel("AppViewModel").setProperty("/layout", "TwoColumnsMidExpanded");

			// skip navigation when deselecting an item in multi selection mode
			if (!(oList.getMode() === "MultiSelect" && !bSelected)) {

				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this.showHierarchyEditor(oEvent.getParameter("listItem") || oEvent.getSource());

			}

			//set hierarchy edit button visibile
			this.getModel("SelectorViewModel").setProperty("/btnHierarchyEditVisible", true);

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
		onUpdateFinished: function(oEvent) {

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
		onSearch: function(oEvent) {
			
			//local data declaration
			var aFilters = [];

			//refresh search button called
			if (oEvent.getParameters().refreshButtonPressed) {
				this.onRefresh();
				return;
			}

			//get query string entered in search field
			var sQuery = oEvent.getParameter("query");

			//construct filter to filter 'items' aggregation binding
			if (sQuery) {
				aFilters = [new Filter("HierarchyText", FilterOperator.Contains, sQuery)];
			} 
			
			//reset the no data text to default when no filter provided
			this.getModel("SelectorViewModel").setProperty("/noDataText", this.getResourceBundle().getText("selectorListNoDataText"));

			//amend 'no data text' to point to the fact that list is now filtered
			if (aFilters.length !== 0) {
				this.getModel("SelectorViewModel").setProperty("/noDataText", this.getResourceBundle().getText("selectorListNoDataWithFilterText"));
			} 

			//apply filters to selector list
			this.getView().byId("SelectorList").getBinding("items").filter(aFilters);

		},

		/**
		 * Event handler for refresh event. Keeps filter, sort
		 * and group settings and refreshes the list binding.
		 * @public
		 */
		onRefresh: function() {

			//prepare view for next action			
			this.prepareViewForNextAction();

			//refresh selector list
			this.oSelectorList.getBinding("items").refresh();

		},

		/**
		 * Event handler for the filter, sort and group buttons to open the ViewSettingsDialog.
		 * @param {sap.ui.base.Event} oEvent the button press event
		 * @public
		 */
		onSort: function(oEvent) {
			
			//local data declaration
			var bDescending = this.getView().getModel("SelectorViewModel").getProperty("/descendingSelectorListSort");
			var aSorters = [];
			
			//Apply sort direction opposite to current
			aSorters.push(new Sorter('HierarchyText', !bDescending));
			this.getView().byId("SelectorList").getBinding("items").sort(aSorters);
			
			//keep track of the new sort order
			this.getView().getModel("SelectorViewModel").setProperty("/descendingSelectorListSort", !bDescending);
			
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
		onConfirmViewSettingsDialog: function(oEvent) {

			this.applySortGroup(oEvent);

		},

		/**
		 * Apply the chosen sorter and grouper to the master list
		 * @param {sap.ui.base.Event} oEvent the confirm event
		 * @private
		 */
		applySortGroup: function(oEvent) {
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
		onBypassed: function() {
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
		createGroupHeader: function(oGroup) {
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
		onNavBack: function() {
			history.go(-1);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		//create view model to control UI behaviour
		createSelectorViewModel: function() {

			//create JSON model with attributes for controlling view behaviour
			return new JSONModel({
				ViewTitle: this.getResourceBundle().getText("SelectorViewTitle", [0]),
				noDataText: this.getResourceBundle().getText("selectorListNoDataText"),
				descendingSelectorListSort: false,
				btnHierarchyEditVisible: false,
				isFilterBarVisible: false,
				sortBy: "HierarchyText",
				isLeadingView: false,
				filterBarLabel: "",
				listMode: "None",
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
		showHierarchyEditor: function(oItem) {

			//get binding context of selected item
			this.oHierarchyBindingContext = oItem.getBindingContext("HierarchyModel");

			//get requested hierarchy from binding context 
			var oHierarchy = this.oHierarchyBindingContext.getObject();

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
		updateListItemCount: function(iTotalItems) {

			// only update the counter if the length is final
			if (this.oSelectorList.getBinding("items").isLengthFinal()) {
				var sTitle = this.getResourceBundle().getText("SelectorViewTitle", [iTotalItems]);
				this.getModel("SelectorViewModel").setProperty("/ViewTitle", sTitle);
			}

		},

		//controller decision whether to delegate OData service error handling
		delegatesODataErrorHandling: function(sStatusCode) {

			//all OData service error handling delegated to ErrorHandler.js
			return true;

		},

		//toggle selector list into and out of delete mode
		onToggleDeleteModeButtonPress: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get current list mode
			var sListMode = this.getView().byId("SelectorList").getMode();

			//depending on current list mode
			switch (sListMode) {

				//currently in 'delete'
				case "Delete":

					//set selector list mode to 'delete'
					this.getView().byId("SelectorList").setMode("None");

					//set toggle button icon
					this.getView().byId("butToggleDeleteMode").setIcon("");

					//prepare view for next action
					this.prepareViewForNextAction();

					//no further processing here
					break;

					//currently in 'single select'
				case "None":

					//set selector list mode to 'delete'
					this.getView().byId("SelectorList").setMode("Delete");

					//set toggle button icon
					this.getView().byId("butToggleDeleteMode").setIcon("sap-icon://alert");

					//message handling: incomplete form input detected
					this.sendStripMessage(this.getResourceBundle().getText("messageListSwitchedToDeleteMode"),
						sap.ui.core.MessageType.Warning);

					//no further processing here
					break;

			}

		},

		//on hierarchy deletion
		onHierarchyDelete: function(oEvent) {

			//local data declaration
			var sConfirmationText;

			//get context pointing to hierarchy for deletion
			var oContext = oEvent.getParameter("listItem").getBindingContext("HierarchyModel");

			//get hierarchy attributes
			var oHierarchy = this.getModel("HierarchyModel").getObject(oContext.getPath());

			//build confirmation text for hierarchy deletion
			sConfirmationText = "Delete hierarchy " + "'" + oHierarchy.HierarchyText + "'?";

			//confirmation dialog to delete this hierarchy
			sap.m.MessageBox.confirm(sConfirmationText, {
				actions: [
					sap.m.MessageBox.Action.YES,
					sap.m.MessageBox.Action.CANCEL
				],

				//on confirmation dialog close
				onClose: (function(oAction) {

					//user choice: proceed with deletion
					if (oAction === sap.m.MessageBox.Action.YES) {

						//delete hierarchy from backend
						this.getModel("HierarchyModel").remove(oContext.getPath(), {

							//hierarchy entity deleted successfully
							success: function() {

								//message handling
								this.sendStripMessage(this.getResourceBundle().getText("messageDeletedHierarchySuccessfully"));

								//remove deleted hierarchy from display
								this.getRouter().getTargets().display("Hierarchy", {
									HierarchyID: null
								});

								//change flexible column layout to hide attributes view where previously opened
								this.getModel("AppViewModel").setProperty("/layout", "TwoColumnsMidExpanded");

								//set hierarchy edit button visibile
								this.getModel("SelectorViewModel").setProperty("/btnHierarchyEditVisible", false);

								//post processing after successful updating in the backend
								this.getModel("HierarchyViewModel").setProperty("/isViewBusy", false);

							}.bind(this),

							//error handler callback function
							error: function(oError) {

								//render error in OData response 
								this.renderODataErrorResponse(oError, "messageAnErrorOccured");

							}.bind(this)

						});

					}

				}).bind(this)

			});

		},

		//on press hierarchy edit button
		onHierarchyEditButtonPress: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//create popover to edit existing hierarchy
			this.oHierarchyEditDialog = sap.ui.xmlfragment("pnp.hierarchyeditor.fragment.HierarchyEdit", this);
			this.oHierarchyEditDialog.attachAfterClose(function() {
				this.oHierarchyEditDialog.destroy();
			}.bind(this));
			this.getView().addDependent(this.oHierarchyEditDialog);

			//initialize input fields
			this.resetFormInput(sap.ui.getCore().byId("formEditHierarchy"));

			//bind edit dialog to hierarchy model instance 
			this.oHierarchyEditDialog.bindElement({
				model: "HierarchyModel",
				path: this.oHierarchyBindingContext.getPath()
			});

			//delay because addDependent will do a async rerendering 
			this.oHierarchyEditDialog.open();

		},

		//on press hierarchy add button
		onHierarchyAddButtonPress: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//create popover to create new hierarchy
			this.oHierarchyAddDialog = sap.ui.xmlfragment("pnp.hierarchyeditor.fragment.HierarchyAdd", this);
			this.oHierarchyAddDialog.attachAfterClose(function() {
				this.oHierarchyAddDialog.destroy();
			}.bind(this));
			this.getView().addDependent(this.oHierarchyAddDialog);

			//instantiate new hierarchy with default attributes
			var oHierarchy = {
				"HierarchyText": "",
				"HierarchyTypeID": null
			};

			//make available new hierarchy item for binding
			this.getModel("SelectorViewModel").setProperty("/NewHierarchy", oHierarchy);

			//bind dialog to view model instance 
			this.oHierarchyAddDialog.bindElement({
				model: "SelectorViewModel",
				path: "/NewHierarchy"
			});

			//initialize input fields
			this.resetFormInput(sap.ui.getCore().byId("formAddHierarchy"));

			//delay because addDependent will do a async rerendering 
			this.oHierarchyAddDialog.open();

		},

		//cancel hierarchy edit
		onPressHierarchyEditCancelButton: function() {

			//close dialog
			this.oHierarchyEditDialog.close();

		},

		//confirm hierarchy edit
		onPressHierarchyEditConfirmButton: function() {

			//Check for missing or invalid input
			if (this.hasIncorrectInput([sap.ui.getCore().byId("formEditHierarchy")])) {

				//message handling: incomplete form input detected
				this.sendStripMessage(this.getResourceBundle().getText("messageInputCheckedWithErrors"),
					sap.ui.core.MessageType.Error, sap.ui.getCore().byId("msHierarchyEditDialogMessageStrip"));

				//no further processing at this point
				return;

			}

			//close dialog
			this.oHierarchyEditDialog.close();

			//no further action where no changes
			if (!this.getModel("HierarchyModel").hasPendingChanges()) {
				return;
			}

			//create this node on the backend
			this.getModel("HierarchyModel").submitChanges({

				//success handler for create response
				success: function(oData) {

					//message handling: successfully created
					this.sendStripMessage(this.getResourceBundle().getText("messageUpdatedSuccessfully"), "Success");

				}.bind(this),

				//error handler for delete
				error: function(oError) {

					//render error in OData response 
					this.renderODataErrorResponse(oError, "messageAnErrorOccured");

				}.bind(this)

			});

		},

		//cancel hierarchy addition
		onPressHierarchyAddCancelButton: function() {

			//close dialog
			this.oHierarchyAddDialog.close();

		},

		//confirm hierarchy addition
		onPressHierarchyAddConfirmButton: function() {

			//Check for missing or invalid input
			if (this.hasIncorrectInput([sap.ui.getCore().byId("formAddHierarchy")])) {

				//message handling: incomplete form input detected
				this.sendStripMessage(this.getResourceBundle().getText("messageInputCheckedWithErrors"),
					sap.ui.core.MessageType.Error, sap.ui.getCore().byId("msHierarchyAddDialogMessageStrip"));

				//no further processing at this point
				return;

			}

			//close dialog
			this.oHierarchyAddDialog.close();

			//retrieve new hierarchy for insert
			var oNewHierarchy = this.getModel("SelectorViewModel").getProperty("/NewHierarchy");

			//set node key information
			oNewHierarchy.HierarchyID = this.getGUID();

			//create this node on the backend
			this.getModel("HierarchyModel").create("/Hierarchies", oNewHierarchy, {

				//success handler for create response
				success: function(oData) {

					//message handling: successfully created
					this.sendStripMessage(this.getResourceBundle().getText("msgHierarchyCreatedSuccessfully"), "Success");

				}.bind(this),

				//error handler for delete
				error: function(oError) {

					//render error in OData response 
					this.renderODataErrorResponse(oError, "messageAnErrorOccured");

				}.bind(this)

			});

		},

		//on change of input on hierarchy add dialog
		onHierarchyAddInputChange: function() {

			//validate input
			this.hasIncorrectInput([sap.ui.getCore().byId("formAddHierarchy")]);

			//hide message strip in case it was visible
			sap.ui.getCore().byId("msHierarchyAddDialogMessageStrip").setVisible(false);

		}

	});

});