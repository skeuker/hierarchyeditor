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

		},

		//handle view display
		onDisplay: function(oEvent) {

			//local data declaration
			var sODataEntitySet;
			var sFilterPath;
			var sFilterValue1;
			var oUrlParameters = {};

			//prepare view for next action
			this.prepareViewForNextAction();

			//get data received with navigation
			var oNavData = oEvent.getParameter("data");

			//no further processing where applicable
			if (!oNavData.HierarchyItem) {
				return;
			}

			//adopt hierarchy item invoking this display
			var oHierarchyItem = oNavData.HierarchyItem;

			//depending on type of hierarchy item
			switch (oHierarchyItem.NodeTypeID) {

				//hierarchy item is of type solution area
				case "SA":

					//set entity set and filter path
					sODataEntitySet = "SolutionAreas";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = oHierarchyItem.HierarchyNodeID;

					//set url parameters to expand to person
					oUrlParameters = {
						"$expand": "toSolutionAreaArchitect"
					};

					break;

					//hierarchy item is of type solution area component
				case "SAC":

					//set entity set and filter path
					sODataEntitySet = "SolutionAreaComponents";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = oHierarchyItem.HierarchyNodeID;

					break;

					//hierarchy item is of type application area
				case "AA":

					//set entity set and filter path
					sODataEntitySet = "ApplicationAreas";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = oHierarchyItem.HierarchyNodeID;

					//set url parameters to expand to person
					oUrlParameters = {
						"$expand": "toApplicationAreaArchitect"
					};

					break;

					//hierarchy item is of type application area component
				case "AAC":

					//set entity set and filter path
					sODataEntitySet = "ApplicationAreaComponents";
					sFilterPath = "HierarchyNodeID";
					sFilterValue1 = oHierarchyItem.HierarchyNodeID;

					break;

					//hierarchy item is member	
				case "":

					//set entity set and filter path
					sODataEntitySet = "Resources";
					sFilterPath = "HierarchyMemberID";
					sFilterValue1 = oHierarchyItem.MemberID;

			}

			//read service model entity
			this.getModel("ServiceModel").read("/" + sODataEntitySet, {

				//url parameters
				urlParameters: oUrlParameters,

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

					//create path to this entity in the service model
					var sODataEntityPath = "/" + this.getModel("ServiceModel").createKey(sODataEntitySet, oHierarchyItem);

					//bind view to service model  
					this.getView().bindElement({
						model: "ServiceModel",
						path: sODataEntityPath
					});

					//set view title
					var oServiceItem = this.getModel("ServiceModel").getProperty(sODataEntityPath);
					this.getModel("AttributesViewModel").setProperty("/viewTitle", oServiceItem["/Text/"]);

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

			//detect changes in model data
			if (this.getModel("ServiceModel").hasPendingChanges()) {

				//keep track in view model that changes to model data are present
				this.getOwnerComponent().getModel("AttributesViewModel").setProperty("/isSaveEnabled", true);

			}

		}

	});

});