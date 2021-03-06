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
			this.oServiceHierarchyModel = this.getOwnerComponent().getModel("ServiceHierarchyModel");
			this.setModel(this.oServiceHierarchyModel, "ServiceHierarchyModel");

		},
		
		//prepare view for next action
		prepareViewForNextAction: function() {

			//remove all messages from the message manager
			this.oMessageManager.removeAllMessages();

			//set current view as leading view
			this.setAsLeadingView();

		},

		//prepare view for display
		prepareViewForDisplay: function(oNavData) {

			//local data declaration
			var sODataEntitySet;
			var sTextAttribute;
			var sFilterPath;

			//prepare view for next action
			this.prepareViewForNextAction();

			//set save button to disabled
			this.getModel("AttributesViewModel").setProperty("/isSaveEnabled", false);

			//no further processing where applicable
			if (!oNavData || !oNavData.HierarchyItem) {
				return;
			}

			//initialize input fields on attributes form
			this.getView().unbindElement("ServiceHierarchyModel");

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
					sTextAttribute = "SolutionAreaText";
					sFilterPath = "SolutionAreaID";

					//ensure form container for solution area is visible
					this.toggleFormContainerVisibility("fcontSolutionArea");
					
					//no further processing here
					break;

					//hierarchy item is of type solution area component
				case "SAC":

					//set entity set and filter path
					sODataEntitySet = "SolutionAreaComponents";
					sTextAttribute = "SolutionAreaComponentText";
					sFilterPath = "SolutionAreaComponentID";

					//ensure form container for solution area component is visible
					this.toggleFormContainerVisibility("fcontSolutionAreaComponent");
					
					//no further processing here
					break;

					//hierarchy item is of type application
				case "AP":

					//set entity set and filter path
					sODataEntitySet = "Applications";
					sTextAttribute = "ApplicationText";
					sFilterPath = "ApplicationID";

					//ensure form container for application is visible
					this.toggleFormContainerVisibility("fcontApplication");
					
					//no further processing here
					break;

					//hierarchy item is of type application area component
				case "APC":

					//set entity set and filter path
					sODataEntitySet = "ApplicationComponents";
					sTextAttribute = "ApplicationComponentText";
					sFilterPath = "ApplicationComponentID";
					
					//ensure form container for application component is visible
					this.toggleFormContainerVisibility("fcontApplicationComponent");
					
					//no further processing here
					break;

					//hierarchy item is member	
				case "":

					//set entity set and filter path
					sODataEntitySet = "Resources";
					sTextAttribute = "ResourceText";
					sFilterPath = "ResourceID";
					
					//ensure form container for resource is visible
					this.toggleFormContainerVisibility("fcontResource");
					
					//no further processing here
					break;

			}

			//set view to busy
			this.getModel("AttributesViewModel").setProperty("/isViewBusy", true);

			//read service model entity
			this.getModel("ServiceHierarchyModel").read("/" + sODataEntitySet, {

				//filter
				filters: [new Filter({
					path: sFilterPath,
					operator: "EQ",
					value1: this.oHierarchyItem.ExternalEntityID
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
					var sODataEntityPath = "/" + this.getModel("ServiceHierarchyModel").createKey(sODataEntitySet, oServiceHierarchyItem);

					//bind view to service model  
					this.getView().bindElement({
						model: "ServiceHierarchyModel",
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
			var bHasPendingChanges = this.getModel("ServiceHierarchyModel").hasPendingChanges();

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
								this.getModel("ServiceHierarchyModel").resetChanges();

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
			if (this.getModel("ServiceHierarchyModel").hasPendingChanges()) {

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
			this.oServiceHierarchyModel.submitChanges({

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
					this.sendToastMessage(this.getResourceBundle().getText("messageUpdatedSuccessfully"));

				}.bind(this),

				//success callback function
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//toggle form container visibility depending on type
		toggleFormContainerVisibility: function(sVisibleFormContainer) {
			
			//solution area 
			var oFcontSolutionArea = this.getView().byId("fcontSolutionArea");
			if(sVisibleFormContainer === "fcontSolutionArea"){
				oFcontSolutionArea.setVisible(true);	
			}else{
				oFcontSolutionArea.setVisible(false);
			}
			
			//solution area component
			var oFcontSolutionAreaComponent = this.getView().byId("fcontSolutionAreaComponent");
			if(sVisibleFormContainer === "fcontSolutionAreaComponent"){
				oFcontSolutionAreaComponent.setVisible(true);	
			}else{
				oFcontSolutionAreaComponent.setVisible(false);
			}

			//application
			var oFcontApplication = this.getView().byId("fcontApplication");
			if(sVisibleFormContainer === "fcontApplication"){
				oFcontApplication.setVisible(true);	
			}else{
				oFcontApplication.setVisible(false);
			}
			
			//application component
			var oFcontApplicationComponent = this.getView().byId("fcontApplicationComponent");
			if(sVisibleFormContainer === "fcontApplicationComponent"){
				oFcontApplicationComponent.setVisible(true);	
			}else{
				oFcontApplicationComponent.setVisible(false);
			}
			
			//resource
			var oFcontResource = this.getView().byId("fcontResource");
			if(sVisibleFormContainer === "fcontResource"){
				oFcontResource.setVisible(true);	
			}else{
				oFcontResource.setVisible(false);
			}
			
		}

	});

});