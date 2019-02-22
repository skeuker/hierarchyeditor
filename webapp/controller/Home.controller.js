sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter"
], function(BaseController, JSONModel, Filter) {
	"use strict";

	return BaseController.extend("pnp.hierarchyeditor.controller.Home", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf pnp.hierarchyeditor.view.Home
		 */
		onInit: function() {

			//instantiate view model and set to view
			this.oViewModel = new JSONModel({
				viewTitle: this.getResourceBundle().getText("titleHomeView"),
				busyDelay: 0,
				busy: false
			});
			this.setModel(this.oViewModel, "ViewModel");

			//get resource bundle
			this.oResourceBundle = this.getResourceBundle();

			//prepare message handling
			this.oMessageStrip = this.byId("msMessageStrip");
			if (this.oMessageStrip) {
				this.oMessageStrip.setVisible(false);
			}

			//attach to display event for survey detail
			this.getRouter().getTarget("Home").attachDisplay(this.onDisplay, this);

			//initiate interaction with message manager	
			this.oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.oMessageManager.registerMessageProcessor(this.oMessageProcessor);
			this.getView().setModel(this.oMessageManager.getMessageModel(), "MessageModel");

			//keep track of Hierarchy JSON Model
			this.oHierarchyModel = this.getOwnerComponent().getModel("HierarchyModel");
			this.setModel(this.oHierarchyModel, "HierarchyModel");

			//initialize tree expand level
			this.iTreeExpandLevel = 0;

		},

		//on after rendering
		onAfterRendering: function() {

		},

		//prepare view for next action
		prepareViewForNextAction: function() {

			//hide message strip 
			this.oMessageStrip.setVisible(false);

			//remove all messages from the message manager
			this.oMessageManager.removeAllMessages();

		},

		//handle view display
		onDisplay: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//construct hierarchy key
			var sHierarchyPath = this.getModel("HierarchyModel").createKey("Hierarchies", {
				HierarchyID: "1"
			});

			//set view to busy
			this.getModel("ViewModel").setProperty("/isViewBusy", true);

			//read hierarchy metadata (without expanding to hierarchy nodes)
			this.getModel("HierarchyModel").read("/" + sHierarchyPath, {

				//url parameters
				urlParameters: {
					"$expand": "toMetadata,toMetadata/toNodeDefinitions,toMetadata/toNodeMemberDefinitions,toMetadata/toNodeTypes,toMetadata/toMemberTypes"
				},

				//success handler
				success: function(oData) {

					//create object carrying hierarchy metadata about node and member types
					var oHierarchyMetaData = {};
					oHierarchyMetaData.NodeTypes = oData.toMetadata.toNodeTypes.results;
					oHierarchyMetaData.MemberTypes = oData.toMetadata.toMemberTypes.results;
					oHierarchyMetaData.NodeDefinitions = oData.toMetadata.toNodeDefinitions.results;
					oHierarchyMetaData.NodeMemberDefinitions = oData.toMetadata.toNodeMemberDefinitions.results;

					//create JSON model carrying object containing hierarchy meta data model
					var oHierarchyMetaDataModel = new JSONModel(oHierarchyMetaData);

					//bind hierarchy metadata model to view
					this.getView().setModel(oHierarchyMetaDataModel, "HierarchyMetaDataModel");

					//set view to busy
					this.getModel("ViewModel").setProperty("/isViewBusy", false);

				}.bind(this)

			});

			//get access to hierarchy tree table instance
			var oHierarchyTable = this.getView().byId("TreeTable");

			//do bind aggregation 'rows' of treetable to hierarchnodes of this hierarchy
			oHierarchyTable.bindRows({

				//oData binding path
				path: "HierarchyModel>/HierarchyNodes",

				//filters
				filters: [new Filter({
					path: "HierarchyID",
					operator: "EQ",
					value1: "1"
				})],

				//other binding parameters
				parameters: {
					countMode: "Inline",
					operationMode: "Client",
					numberOfExpandedLevels: 0,
					useServersideApplicationFilters: "true",
					treeAnnotationProperties: {
						hierarchyLevelFor: "HierarchyLevel",
						hierarchyNodeFor: "HierarchyNodeID",
						hierarchyParentNodeFor: "ParentNodeID",
						hierarchyDrillStateFor: "DrillState",
						hierarchyNodeDescendantCountFor: "ChildCount"
					}
				},

				//event handlers
				events: {
					"dataRequested": function() {
						this.oViewModel.setProperty("/isHierarchyBusy", true);
					}.bind(this),
					"dataReceived": function() {
						this.oViewModel.setProperty("/isHierarchyBusy", false);
					}.bind(this)
				}

			});

		},

		//on drag start
		onDragStart: function(oEvent) {

			//local data declaration
			var oTreeTable = this.byId("TreeTable");
			var oDragSession = oEvent.getParameter("dragSession");
			var oDraggedRow = oEvent.getParameter("target");
			var iDraggedRowIndex = oDraggedRow.getIndex();
			var aSelectedIndices = oTreeTable.getSelectedIndices();
			var aDraggedRowContexts = [];

			//prepare view for next action
			this.prepareViewForNextAction();

			//compose context of dragged row(s)
			if (aSelectedIndices.length > 0) {
				// If rows are selected, do not allow to start dragging from a row which is not selected.
				if (aSelectedIndices.indexOf(iDraggedRowIndex) === -1) {
					oEvent.preventDefault();
				} else {
					for (var i = 0; i < aSelectedIndices.length; i++) {
						aDraggedRowContexts.push(oTreeTable.getContextByIndex(aSelectedIndices[i]));
					}
				}
			} else {
				aDraggedRowContexts.push(oTreeTable.getContextByIndex(iDraggedRowIndex));
			}

			//set dragged row to drag session instance
			oDragSession.setComplexData("hierarchymaintenance", {
				draggedRowContexts: aDraggedRowContexts
			});

		},

		//on drop
		onDrop: function(oEvent) {

			//local data declaration
			var oTreeTable = this.byId("TreeTable");
			var oDragSession = oEvent.getParameter("dragSession");
			var oDroppedRow = oEvent.getParameter("droppedControl");
			var aDraggedRowContexts = oDragSession.getComplexData("hierarchymaintenance").draggedRowContexts;
			var oNewParentContext = oTreeTable.getContextByIndex(oDroppedRow.getIndex());

			//prepare view for next action
			this.prepareViewForNextAction();

			if (aDraggedRowContexts.length === 0 || !oNewParentContext) {
				return;
			}

			var oModel = oTreeTable.getBinding("rows").getModel();
			var oNewParent = oNewParentContext.getProperty();

			// In the JSON data of this example the children of a node are inside an array with the name "categories".
			if (!oNewParent.categories) {
				oNewParent.categories = []; // Initialize the children array.
			}

			for (var i = 0; i < aDraggedRowContexts.length; i++) {
				if (oNewParentContext.getPath().indexOf(aDraggedRowContexts[i].getPath()) === 0) {
					// Avoid moving a node into one of its child nodes.
					continue;
				}

				// Copy the data to the new parent.
				oNewParent.categories.push(aDraggedRowContexts[i].getProperty());

				// Remove the data. The property is simply set to undefined to preserve the tree state (expand/collapse states of nodes).
				oModel.setProperty(aDraggedRowContexts[i].getPath(), undefined, aDraggedRowContexts[i], true);
			}

		},

		//on change of node category
		onNodeCategoryChange: function() {

			//HierarchyMetaDataModel>/NodeTypes
			//HierarchyMetaDataModel>/MemberTypes

			//this.HierarchyMetaData
			//.toNodeDefinitions.results[]
			//HierarchyTypeID
			//HierarchyLevel
			//NodeTypeID
			//.toNodeMemberDefinitions.results[]
			//HierarchyTypeID
			//MemberTypeID
			//NodeTypeID

		},

		//set applicable hierarchy metadata filters
		setApplicableHierarchyMetaDataFilter: function(oHierarchyItem) {

			//local data declaration
			var aNodeTypeFilters = [];
			var aApplicableNodeTypes = [];

			//get hierarchy metadata
			var oHierarchyMetaData = this.getModel("HierarchyMetaDataModel").getProperty("/");

			//derive all node types applicable for this hierarchy level as child
			var iChildHierarchyLevel = oHierarchyItem.HierarchyLevel + 1;
			oHierarchyMetaData.NodeDefinitions.forEach(function(oNodeDefinition) {

				//keep track of this node type as applicable sibling node type
				if (oHierarchyItem.HierarchyLevel === oNodeDefinition.HierarchyLevel
					&& oHierarchyItem.RelationshipTypeID === "2") {  //Sibling
					aApplicableNodeTypes.push(oNodeDefinition.NodeTypeID);
				}

				//keep track of this node type as applicable child node type
				if (iChildHierarchyLevel === oNodeDefinition.HierarchyLevel
					&& oHierarchyItem.RelationshipTypeID === "1") {  //Child
					aApplicableNodeTypes.push(oNodeDefinition.NodeTypeID);
				}

			});

			//get access to node type select ui control
			var oNodeTypesBindingContext = sap.ui.getCore().byId("inputNodeTypeID").getBindingContext("items");

			//build filter array of applicable node types			
			aApplicableNodeTypes.forEach(function(oNodeType) {
				aNodeTypeFilters.push(new Filter({
					path: "NodeTypeID",
					operator: "EQ",
					value1: oNodeType.NodeTypeID
				}));
			});
			
			//apply filter to aggregation binding
			oNodeTypesBindingContext.filter(aNodeTypeFilters);

		},

		//is allowable node drop location
		isAllowableNodeDropLocation: function(oAnchorNode, oNode) {

		},

		//on add node
		onAddHierarchyItem: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get node instance being deleted
			var oHierarchyTree = this.getView().byId("TreeTable");
			var iSelectedIndex = oHierarchyTree.getSelectedIndex();

			//message handling: no row selected
			if (iSelectedIndex === -1) {

				//message handling: select a row
				this.sendStripMessage(this.getResourceBundle().getText("msgSelectARowFirst"), sap.ui.core.MessageType.Warning);

				//no further processing
				return;

			}

			//create popover to add new hiearchy item
			var oHierarchyItemAddPopover = sap.ui.xmlfragment("pnp.hierarchyeditor.fragment.HierarchyItemAdd", this);
			oHierarchyItemAddPopover.attachAfterClose(function() {
				oHierarchyItemAddPopover.destroy();
			});
			this.getView().addDependent(oHierarchyItemAddPopover);

			//get hiearchy item corresponding to selected row
			var oHierarchyItem = oHierarchyTree.getRows()[iSelectedIndex].getBindingContext("HierarchyModel").getObject();

			//set ViewModel attributes that are bound on popover
			this.oViewModel.setProperty("/sSelectedNodeText", oHierarchyItem.NodeText);

			//set an initial new item instance for binding
			this.oViewModel.setProperty("/NewItem", {
				"NodeText": "",
				"NodeCategoryID": "1", //Node
				"NodeTypeID": null,
				"MemberTypeID": null,
				"RelationshipTypeID": "2" //Child
			});

			//bind popover to view model instance 
			oHierarchyItemAddPopover.bindElement({
				model: "ViewModel",
				path: "/NewItem"
			});
			
			//set applicable hierarchy metadata filters
			this.setApplicableHierarchyMetaDataFilter();

			// delay because addDependent will do a async rerendering 
			var oButtonHierarchyItemAdd = this.getView().byId("butHierarchyItemAdd");
			jQuery.sap.delayedCall(0, this, function() {
				oHierarchyItemAddPopover.openBy(oButtonHierarchyItemAdd);
			});

		},

		//on closing the hierarchy item add popover
		onCloseHierarchyItemAddPopover: function() {

			//close hierarchy item add popover
			sap.ui.getCore().byId("popHierarchyItemAdd").close();

		},

		//on insert of a new hierarchy item
		onInsertHierarchItem: function() {

			//get selected node instance
			var oHierarchyTree = this.getView().byId("TreeTable");
			var iSelectedIndex = oHierarchyTree.getSelectedIndex();

			//get hiearchy item corresponding to selected row
			var oSelectedHierarchyItem = oHierarchyTree.getRows()[iSelectedIndex].getBindingContext("HierarchyModel").getObject();

			//retrieve new item for hierarchy insert
			var oNewItem = this.getModel("ViewModel").getProperty("/NewItem");
			oNewItem.HierarchyID = oSelectedHierarchyItem.HierarchyID;
			oNewItem.HierarchyNodeID = this.getGUID();

			//create a sibling or child
			switch (oNewItem.RelationshipTypeID) {
				case "2":
					oNewItem.ParentNodeID = oSelectedHierarchyItem.HierarchyNodeID;
					oNewItem.HierarchyLevel = oSelectedHierarchyItem.HierarchyLevel + 1;
					break;
			}

			//build member attributes where applicable
			switch (oNewItem.NodeCategoryID) {

				//node of type root or inner node
				case "1":
					delete oNewItem.HierarchyMembID;
					delete oNewItem.MemberTypeID;
					break;

					//node of type leaf
				case "2":
					oNewItem.HierarchyMembID = this.getGUID();
					break;
			}

			//remove new item property that does not exist in backend
			delete oNewItem.RelationshipTypeID;

			//close hierarchy item add popover
			sap.ui.getCore().byId("popHierarchyItemAdd").close();

			//create this node on the backend
			this.getModel("HierarchyModel").create("/HierarchyNodes", oNewItem, {

				//success handler for delete
				success: function(oData) {

					//message handling: successfully created
					this.sendStripMessage(this.getResourceBundle().getText("msgNodeCreatedSuccessfully"), "Success");

				}.bind(this),

				//error handler for delete
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//on delete node
		onDeleteHierarchyItem: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get node instance being deleted
			var oHierarchyTree = this.getView().byId("TreeTable");
			var iSelectedIndex = oHierarchyTree.getSelectedIndex();

			//message handling: no row selected
			if (iSelectedIndex === -1) {

				//message handling: select a row
				this.sendStripMessage(this.getResourceBundle().getText("msgSelectARowFirst"), sap.ui.core.MessageType.Warning);

				//no further processing
				return;

			}

			//get binding context of selected row
			var sNodePath = oHierarchyTree.getRows()[iSelectedIndex].getBindingContext("HierarchyModel").getPath();

			//remove this node from the backend
			this.getModel("HierarchyModel").remove(sNodePath, {

				//success handler for delete
				success: function() {

					//message handling: successfully updated
					this.sendStripMessage(this.getResourceBundle().getText("msgNodeDeletedSuccessfully"), "Success");

				}.bind(this),

				//error handler for delete
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//on refresh
		onRefresh: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get access to treetable instance
			var oHierarchyTable = this.getView().byId("TreeTable");

			//refresh binding of 'rows' aggregation
			oHierarchyTable.getBinding("rows").refresh(true);

			//expand to requested level
			oHierarchyTable.expandToLevel(this.iTreeExpandLevel);

		},

		//on assigned filters changed
		onAssignedFiltersChanged: function() {

		},

		//on hierarchy row selection change
		onHierarchyRowSelectionChange: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

		},

		//on collapse of all levels
		onCollapseAllNodes: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get access to hieararchy table
			var oHierarchyTable = this.byId("TreeTable");

			//collapse all nodes
			oHierarchyTable.collapseAll();

			//keep track of expand level
			this.iTreeExpandLevel = 0;

		},

		//on expand first level nodes
		onExpandAllNodesToLevel: function() {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get access to hieararchy table
			var oHierarchyTable = this.byId("TreeTable");

			//keep track of expand level
			this.iTreeExpandLevel = this.iTreeExpandLevel + 1;

			//expand to requested level
			oHierarchyTable.expandToLevel(this.iTreeExpandLevel);

		},

		//on click in cell
		onHierarchyCellClick: function(oEvent) {

			//get clicked cell content
			var sNodeText = oEvent.getParameter("cellControl").getText();

			//reset selected row index where row is empty
			if (!sNodeText) {
				this.getView().byId("TreeTable").setSelectedIndex(-1);
			}

		}

	});

});