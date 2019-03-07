sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter"
], function(BaseController, JSONModel, Filter) {
	"use strict";

	return BaseController.extend("pnp.hierarchyeditor.view.controller.Attributes", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf pnp.hierarchyeditor.view.view.Attributes
		 */
		onInit: function() {

			//instantiate view model and set to view
			this.oViewModel = new JSONModel({
				viewTitle: this.getResourceBundle().getText("titleAttributesView"),
				isSaveEnabled: false,
				isLeadingView: false,
				busyDelay: 0,
				busy: false
			});
			this.setModel(this.oViewModel, "AttributesViewModel");

			//register this view model on component
			this.getOwnerComponent().setModel(this.oViewModel, "AttributesViewModel");

			//get resource bundle
			this.oResourceBundle = this.getResourceBundle();

			//prepare message handling
			this.oMessageStrip = this.byId("msMessageStrip");
			if (this.oMessageStrip) {
				this.oMessageStrip.setVisible(false);
			}

			//initiate interaction with message manager	
			this.oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.oMessageManager.registerMessageProcessor(this.oMessageProcessor);
			this.getView().setModel(this.oMessageManager.getMessageModel(), "MessageModel");

			//attach to display event for survey detail
			this.getRouter().getTarget("Attributes").attachDisplay(this.onDisplay, this);

			//keep track of service OData model
			this.oServiceModel = this.getOwnerComponent().getModel("ServiceModel");
			this.setModel(this.oServiceModel, "ServiceModel");

		},

		//prepare view for display
		prepareViewForDisplay: function(oNavData) {

			//local data declaration
			var sODataEntitySet;
			var sFilterPath;
			var sFilterValue1;
			var sTextAttribute;

			//prepare view for next action
			this.prepareViewForNextAction();

			//set save button to disabled
			this.getModel("AttributesViewModel").setProperty("/isSaveEnabled", false);

			//no further processing where applicable
			if (!oNavData || !oNavData.HierarchyItem) {
				return;
			}

			//initialize input fields on attributes form
			this.getView().unbindElement("ServiceModel");

			//adopt hierarchy item invoking this display
			this.oHierarchyItem = oNavData.HierarchyItem;
			this.oHierarchyComponent = oNavData.HierarchyComponent;

			//keep track of this controller on the component
			this.getOwnerComponent().oAttributesController = this;

			//depending on type of hierarchy item
			switch (this.oHierarchyItem.NodeTypeID) {

				//hierarchy item is of type solution area
				case "SA":

					//set entity set and filter path
					sODataEntitySet = "SolutionAreas";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = this.oHierarchyItem.HierarchyNodeID;
					sTextAttribute = "SolutionAreaText";

					break;

					//hierarchy item is of type solution area component
				case "SAC":

					//set entity set and filter path
					sODataEntitySet = "SolutionAreaComponents";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = this.oHierarchyItem.HierarchyNodeID;
					sTextAttribute = "SolutionAreaComponentText";

					break;

					//hierarchy item is of type application area
				case "AA":

					//set entity set and filter path
					sODataEntitySet = "ApplicationAreas";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = this.oHierarchyItem.HierarchyNodeID;
					sTextAttribute = "ApplicationAreaText";

					break;

					//hierarchy item is of type application area component
				case "AAC":

					//set entity set and filter path
					sODataEntitySet = "ApplicationAreaComponents";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = this.oHierarchyItem.HierarchyNodeID;
					sTextAttribute = "ApplicationAreaComponentText";

					break;

					//hierarchy item is member	
				case "":

					//set entity set and filter path
					sODataEntitySet = "Resources";
					sFilterPath = "HierarchyMemberID";
					sFilterValue1 = this.oHierarchyItem.MemberID;
					sTextAttribute = "MemberText";

			}

			//set view to busy
			this.getModel("AttributesViewModel").setProperty("/isViewBusy", true);

			//read service model entity
			this.getModel("ServiceModel").read("/" + sODataEntitySet, {

				//filter
				filters: [new Filter({
					path: sFilterPath,
					operator: "EQ",
					value1: sFilterValue1
				})],

				//success handler
				success: function(oData) {

					//inspect batchResponses for errors and visualize
					if (this.hasODataBatchErrorResponse(oData.__batchResponses)) {
						return;
					}

					//get hold of service hierarchy item
					var oServiceHierarchyItem = oData.results[0];

					//create path to this entity in the service model
					var sODataEntityPath = "/" + this.getModel("ServiceModel").createKey(sODataEntitySet, oServiceHierarchyItem);

					//bind view to service model  
					this.getView().bindElement({
						model: "ServiceModel",
						path: sODataEntityPath
					});

					//set view title
					this.getModel("AttributesViewModel").setProperty("/viewTitle", oServiceHierarchyItem[sTextAttribute]);

					//set view to busy
					this.getModel("AttributesViewModel").setProperty("/isViewBusy", false);

				}.bind(this),

				//success callback function
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//handle view display
		onDisplay: function(oEvent) {

			//keep track of incoming event
			var oNavData = oEvent.getParameter("data");

			//detect whether changes are present
			var bHasPendingChanges = this.getModel("ServiceModel").hasPendingChanges();

			//depending on whether unsaved changes are present
			switch (bHasPendingChanges) {

				//unsaved changes exist
				case true:

					//confirmation dialog to delete this hierarchy
					sap.m.MessageBox.confirm(this.getResourceBundle().getText("confirmNavigateWithoutSave"), {

						//'yes' and 'cancel' as confirm options
						actions: [
							sap.m.MessageBox.Action.YES,
							sap.m.MessageBox.Action.CANCEL
						],

						//on confirmation dialog close
						onClose: function(oAction) {

							//user choice: discard unsaved changes
							if (oAction === sap.m.MessageBox.Action.YES) {

								//discard unsaved changes
								this.getModel("ServiceModel").resetChanges();

								//set save button to disabled awaiting changes to be made
								this.getOwnerComponent().getModel("AttributesViewModel").setProperty("/isSaveEnabled", false);

								//prepare view for display
								this.prepareViewForDisplay(oNavData);

							}

						}.bind(this)

					});

					//no further processing here
					break;

					//no unsaved changes exist
				case false:

					//prepare view for display
					this.prepareViewForDisplay(oNavData);

					//no further processing here
					break;

			}

		},

		//set this view as leading view
		setAsLeadingView: function() {

			//set this view as leading view
			this.getOwnerComponent().getModel("AttributesViewModel").setProperty("/isLeadingView", true);

			//demote other views in this application
			this.getOwnerComponent().getModel("SelectorViewModel").setProperty("/isLeadingView", false);
			this.getOwnerComponent().getModel("HierarchyViewModel").setProperty("/isLeadingView", false);

		},

		//handline change of input
		onInputChange: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//detect changes in model data
			if (this.getModel("ServiceModel").hasPendingChanges()) {

				//keep track in view model that changes to model data are present
				this.getOwnerComponent().getModel("AttributesViewModel").setProperty("/isSaveEnabled", true);

			}

		},

		//on press of save attributes button
		onPressSaveAttributesButton: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//set view to busy
			this.oViewModel.setProperty("/isViewBusy", true);

			//submit changes to the backend
			this.oServiceModel.submitChanges({

				//success callback function
				success: function(oData) {

					//inspect batchResponses for errors and visualize
					if (this.hasODataBatchErrorResponse(oData.__batchResponses)) {
						return;
					}

					//inform hierarchy component that attributes save occured
					this.oHierarchyComponent.onSaveOfHierarchyItem(this.oHierarchyItem);

					//set save button to disabled
					this.getModel("AttributesViewModel").setProperty("/isSaveEnabled", false);

					//set view to busy
					this.oViewModel.setProperty("/isViewBusy", false);

					//message handling: successfully created
					this.sendStripMessage(this.getResourceBundle().getText("messageUpdatedSuccessfully"), "Success");

				}.bind(this),

				//success callback function
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		}

	});

});