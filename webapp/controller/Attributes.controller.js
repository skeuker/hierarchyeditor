sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel"
], function(BaseController, JSONModel) {
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
				isLeadingView: false,
				busyDelay: 0,
				busy: false
			});
			this.setModel(this.oViewModel, "AttributesViewModel");
			
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
			
			//get navigation attributes
			var oNavData = oEvent.getParameter("data");

			//get OData model for Hierarchy
			var oServiceModel = this.getModel("ServiceModel");

			//create key of this hierarchy item
			//var oHierarchyItemKey = this.getModel("HierarchyModel").createKey("HierarchyNodes", oHierarchyItem);


		}

		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf pnp.hierarchyeditor.view.view.Attributes
		 */
		//	onBeforeRendering: function() {
		//
		//	},

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf pnp.hierarchyeditor.view.view.Attributes
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf pnp.hierarchyeditor.view.view.Attributes
		 */
		//	onExit: function() {
		//
		//	}

	});

});