sap.ui.define([
	"pnp/hierarchyeditor/controller/Base.controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	'sap/m/MessageBox'
], function(BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("pnp.hierarchyeditor.controller.Hierarchy", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf pnp.hierarchyeditor.view.Hierarchy
		 */
		onInit: function() {

			//instantiate view model and set to view
			this.oViewModel = new JSONModel({
				viewTitle: this.getResourceBundle().getText("titleHierarchyView"),
				isPageHeaderExpanded: false,
				isLeadingView: false,
				busyDelay: 0,
				busy: false
			});
			this.setModel(this.oViewModel, "HierarchyViewModel");

			//register this view model on component
			this.getOwnerComponent().setModel(this.oViewModel, "HierarchyViewModel");

			//get resource bundle
			this.oResourceBundle = this.getResourceBundle();

			//prepare message handling
			this.oMessageStrip = this.byId("msMessageStrip");
			if (this.oMessageStrip) {
				this.oMessageStrip.setVisible(false);
			}

			//attach to display event for survey detail
			this.getRouter().getTarget("Hierarchy").attachDisplay(this.onDisplay, this);

			//initiate interaction with message manager	
			this.oMessageProcessor = new sap.ui.core.message.ControlMessageProcessor();
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.oMessageManager.registerMessageProcessor(this.oMessageProcessor);
			this.getView().setModel(this.oMessageManager.getMessageModel(), "MessageModel");

			//keep track of Hierarchy JSON Model
			this.oHierarchyModel = this.getOwnerComponent().getModel("HierarchyModel");
			this.setModel(this.oHierarchyModel, "HierarchyModel");

			//get OData model for service hierarchy
			var oServiceHierarchyModel = this.getOwnerComponent().getModel("ServiceHierarchyModel");

			//create service hierarchy filter model
			oServiceHierarchyModel.metadataLoaded().then(function(oEvent) {
				this.createHierarchyFilterModel(oEvent);
			}.bind(this));

			//initialize tree expand level
			this.iTreeExpandLevel = 0;

		},

		//on after rendering
		onAfterRendering: function() {

		},

		//set this view as leading view
		setAsLeadingView: function() {

			//set this view as leading view
			this.getOwnerComponent().getModel("HierarchyViewModel").setProperty("/isLeadingView", true);

			//demote other views in this application
			this.getOwnerComponent().getModel("SelectorViewModel").setProperty("/isLeadingView", false);

			//where attributes model is already instantiated
			var oAttributesViewModel = this.getOwnerComponent().getModel("AttributesViewModel");
			if (oAttributesViewModel) {
				oAttributesViewModel.setProperty("/isLeadingView", false);
			}

		},

		//bind hiearchy tree table to OData model
		bindHierarchyTreeTable: function(oFilter) {

			//get access to hierarchy tree table instance
			var oHierarchyTable = this.getView().byId("TreeTable");

			//do bind aggregation 'rows' of treetable to hierarchnodes of this hierarchy
			oHierarchyTable.bindRows({

				//oData binding path
				path: "HierarchyModel>/HierarchyNodes",

				//filters
				filters: oFilter,

				//other binding parameters
				parameters: {
					countMode: "Inline",
					operationMode: "Client",
					numberOfExpandedLevels: 0,
					autoExpandMode: "Bundle",
					useServersideApplicationFilters: "false",
					treeAnnotationProperties: {
						hierarchyLevelFor: "HierarchyLevel",
						hierarchyNodeFor: "HierarchyNodeID",
						hierarchyParentNodeFor: "ParentNodeID",
						hierarchyNodeDescendantCountFor: "ChildCount",
						hierarchyDrillStateFor: "DrillState"
					}
				},

				//event handlers
				events: {

					//data requested from backend
					"dataRequested": function() {

						//set tree table to busy
						this.oViewModel.setProperty("/isHierarchyBusy", true);

					}.bind(this),

					//data received from backend
					"dataReceived": function(oEvent) {

						//set tree table to no longer busy
						this.oViewModel.setProperty("/isHierarchyBusy", false);

					}.bind(this)

				}

			});

		},

		//prepare view for next action
		prepareViewForNextAction: function() {

			//remove all messages from the message manager
			this.oMessageManager.removeAllMessages();

			//set current view as leading view
			this.setAsLeadingView();

		},

		//prepare for display
		prepareViewForDisplay: function(oEvent) {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get navigation attributes
			var oNavData = oEvent.getParameter("data");

			//get access to hierarchy tree table instance
			var oHierarchyTable = this.getView().byId("TreeTable");

			//special use case: hierarchy deleted from selector list
			if (oNavData && oNavData.HierarchyID === null) {

				//unbind tree table rows
				oHierarchyTable.unbindRows();

				//reset title to 'hierarchy maintenance'
				this.getModel("HierarchyViewModel").setProperty("/viewTitle", this.getResourceBundle().getText("titleHierarchyView"));

				//no further processing
				return;

			}

			//no further processing where no HierarchyID selected yet
			if (!oNavData || !oNavData.HierarchyID) {
				return;
			}

			//construct hierarchy key
			var sHierarchyPath = "/" + this.getModel("HierarchyModel").createKey("Hierarchies", {
				HierarchyID: oNavData.HierarchyID
			});

			//set view to busy
			this.getModel("HierarchyViewModel").setProperty("/isViewBusy", true);

			//read hierarchy metadata (without expanding to hierarchy nodes)
			this.getModel("HierarchyModel").read(sHierarchyPath, {

				//url parameters
				urlParameters: {
					"$expand": "toMetadata,toMetadata/toNodeDefinitions,toMetadata/toNodeMemberDefinitions,toMetadata/toNodeTypes,toMetadata/toMemberTypes"
				},

				//success handler
				success: function(oData) {

					//inspect batchResponses for errors and visualize
					if (this.hasODataBatchErrorResponse(oData.__batchResponses)) {
						return;
					}

					//bind popover to hierarchy model instance 
					this.getView().bindElement({
						model: "HierarchyModel",
						path: sHierarchyPath
					});

					//set view title
					var oHierarchy = this.getModel("HierarchyModel").getProperty(sHierarchyPath);
					this.getModel("HierarchyViewModel").setProperty("/viewTitle", oHierarchy.HierarchyText);

					//create object carrying hierarchy metadata about node and member types
					var oHierarchyMetaData = {};
					oHierarchyMetaData.NodeTypes = oData.toMetadata.toNodeTypes.results;
					oHierarchyMetaData.MemberTypes = oData.toMetadata.toMemberTypes.results;
					oHierarchyMetaData.NodeDefinitions = oData.toMetadata.toNodeDefinitions.results;
					oHierarchyMetaData.NodeMemberDefinitions = oData.toMetadata.toNodeMemberDefinitions.results;
					oHierarchyMetaData.MaxHierarchyLevel = oHierarchyMetaData.NodeDefinitions.length - 1;

					//create JSON model carrying object containing hierarchy meta data model
					var oHierarchyMetaDataModel = new JSONModel(oHierarchyMetaData);

					//bind hierarchy metadata model to view
					this.getView().setModel(oHierarchyMetaDataModel, "HierarchyMetaDataModel");

					//reset and apply facet filter to get hierarchy nodes list display
					this.resetFacetFilter(this.getView().byId("idFacetFilter"));

					//set view to busy
					this.getModel("HierarchyViewModel").setProperty("/isViewBusy", false);

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

			//get OData model for Hierarchy
			var oHierarchyModel = this.getModel("HierarchyModel");

			//where metadata is already loaded
			if (oHierarchyModel.oMetadata && oHierarchyModel.oMetadata.bLoaded) {
				this.prepareViewForDisplay(oEvent);
				return;
			}

			//metadata is not yet loaded register event handler
			oHierarchyModel.metadataLoaded().then(function(oEvent) {
				this.prepareViewForDisplay(oEvent);
			}.bind(this));

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

			//no further processing where applicable
			if (iDraggedRowIndex === -1 && aSelectedIndices.length === 0) {
				return;
			}

			//prepare view for next action
			this.prepareViewForNextAction();

			//keep track of context of the one dragged row
			if (iDraggedRowIndex >= 0) {
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
			var oHierarchyMaintenanceData = oDragSession.getComplexData("hierarchymaintenance");
			var aDraggedRowContexts = oHierarchyMaintenanceData.draggedRowContexts;
			var oNewParentContext = oTreeTable.getContextByIndex(oDroppedRow.getIndex());

			//prepare view for next action
			this.prepareViewForNextAction();

			//no further process as no dragged row contexts identified
			if (!aDraggedRowContexts || aDraggedRowContexts.length === 0 ||
				!oNewParentContext) {
				return;
			}

			//get new parent where node is to be dropped
			var oNewParentNode = oNewParentContext.getProperty();

			//for each node being dragged
			aDraggedRowContexts.forEach(function(oDraggedRowContext) {

				//get access to attributes of dragged node	
				var oDraggedNode = oDraggedRowContext.getProperty();

				//verify whether this node is an allowable drop location
				if (!this.isAllowableNodeDropLocation(oDraggedNode, oNewParentNode)) {

					//message handling: not an allowable drop location
					this.sendBoxMessage(this.getResourceBundle().getText("msgNotAnAllowableDropLocation"), sap.ui.core.MessageType.Error);

					//no further processing
					return;

				}

				//Update parent ID property where existing node
				if (!oDraggedNode.Unassigned) {
					this.getModel("HierarchyModel").setProperty(oDraggedRowContext.getPath() + "/ParentNodeID", oNewParentNode.HierarchyNodeID);
				}

				//Create new hierarchy node where unassigned node
				if (oDraggedNode.Unassigned) {

					//indicate that new hierarchy item to be added as child
					oDraggedNode.RelationshipTypeID = "2"; //Child

					//indicate the parent to this new hierarchy item
					oDraggedNode.oRelatedItem = oNewParentNode;

					//create new hierarchy item 
					this.createHierarchyItem(oDraggedNode);

				}

			}.bind(this));

			//get current tree state of expanded and collapsed nodes
			var oBinding = oTreeTable.getBinding();
			var oCurrentTreeState = oBinding.getCurrentTreeState();

			//submit changes
			this.getModel("HierarchyModel").submitChanges({

				//success callback function
				success: function(oData) {

					//reapply previous tree state after refresh
					oBinding.setTreeState(oCurrentTreeState);

					//inspect batchResponses for errors and visualize
					if (this.hasODataBatchErrorResponse(oData.__batchResponses)) {
						return;
					}

				}.bind(this),

				//success callback function
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//on change of node category
		onNodeCategoryChange: function(oEvent) {

			//take cognisance of change of input
			this.onHierarchyItemAddInputChange(oEvent);

			//get hierarchy item currently being worked on
			var oHierarchyItem = this.getModel("HierarchyViewModel").getProperty("/NewItem");

			//set applicable hierarchy metadata filters 
			this.setApplicableHierarchyMetaDataFilter(oHierarchyItem, "NodeCategoryID");

		},

		//on change of node relationship
		onNodeRelationshipTypeChange: function(oEvent) {

			//take cognisance of change of input
			this.onHierarchyItemAddInputChange(oEvent);

			//get hierarchy item currently being worked on
			var oHierarchyItem = this.getModel("HierarchyViewModel").getProperty("/NewItem");

			//adjust hierarchylevel depending on relationship type
			var iRelationshipDelta = oHierarchyItem.RelationshipTypeID - oHierarchyItem.PreviousRelationshipTypeID;

			//keep track of current relationship type ID
			oHierarchyItem.PreviousRelationshipTypeID = oHierarchyItem.RelationshipTypeID;

			//adjust hierarchy level of item to be inserted
			oHierarchyItem.HierarchyLevel = oHierarchyItem.HierarchyLevel + iRelationshipDelta;

			//set applicable hierarchy metadata filters 
			this.setApplicableHierarchyMetaDataFilter(oHierarchyItem, "RelationshipTypeID");

		},

		//get node categories that are applicable for this hierarchy item
		getApplicableNodeCategories: function(oHierarchyItem) {

			//local data declaration
			var bApplicableNodeCategory;
			var bRootNodeCategoryApplicable;
			var aApplicableNodeCategories = [];

			//get all node categories
			var aNodeCategories = this.getModel("OptionsModel").getProperty("/NodeCategories");

			//derive all node categories applicable for this hierarchy item
			aNodeCategories.forEach(function(oNodeCategory) {

				//prepare for next loop pass
				bApplicableNodeCategory = false;

				//root node for hierarchy level 0
				if (oHierarchyItem.HierarchyLevel === 0 && oNodeCategory.NodeCategoryID === "0") {
					bApplicableNodeCategory = true;
				}

				//branch node where node types available
				var aApplicableNodeTypes = this.getApplicableNodeTypes(oHierarchyItem);
				if (aApplicableNodeTypes.length > 0 && oNodeCategory.NodeCategoryID === "1") {
					bApplicableNodeCategory = true;
				}

				//leaf node where member types available
				var aApplicableMemberTypes = this.getApplicableMemberTypes(oHierarchyItem);
				if (aApplicableMemberTypes.length > 0 && oNodeCategory.NodeCategoryID === "2") {
					bApplicableNodeCategory = true;
				}

				//keep track of applicable node category
				if (bApplicableNodeCategory) {

					//root node category trumps branch
					if (!bRootNodeCategoryApplicable) {
						aApplicableNodeCategories.push({
							NodeCategoryID: oNodeCategory.NodeCategoryID,
							NodeCategoryText: oNodeCategory.NodeCategoryText
						});
					}

					//keep track that root node category is applicable
					if (oNodeCategory.NodeCategoryID === "0") {
						bRootNodeCategoryApplicable = true;
					}

				}

			}.bind(this));

			//feedback to caller
			return aApplicableNodeCategories;

		},

		//get node categories that are applicable for this hierarchy item
		getApplicableRelationshipTypes: function(oHierarchyItem) {

			//local data declaration
			var bApplicableRelationshipType;
			var aApplicableRelationshipTypes = [];

			//get max hierarchy level
			var iMaxHierarchyLevel = this.getModel("HierarchyMetaDataModel").getProperty("/MaxHierarchyLevel");

			//get all relationship types
			var aRelationshipTypes = this.getModel("OptionsModel").getProperty("/RelationshipTypes");

			//derive all relationship types applicable for this hierarchy item
			aRelationshipTypes.forEach(function(oRelationshipType) {

				//prepare for next loop pass
				bApplicableRelationshipType = false;

				//unrelated for hierarchy level 0
				if (oHierarchyItem.HierarchyLevel === 0 && oRelationshipType.RelationshipTypeID === "0") {
					bApplicableRelationshipType = true;
				}

				//detect applicable node and member types
				var aApplicableNodeTypes = this.getApplicableNodeTypes(oHierarchyItem);
				var aApplicableMemberTypes = this.getApplicableMemberTypes(oHierarchyItem);

				//sibling where node or member types available
				if ((aApplicableNodeTypes.length > 0 || aApplicableMemberTypes.length > 0) &&
					oRelationshipType.RelationshipTypeID === "1" &&
					oHierarchyItem.HierarchyLevel !== 0) {
					bApplicableRelationshipType = true;
				}

				//child nodes or members where not already on max hierarchy level
				if ((aApplicableNodeTypes.length > 0 || aApplicableMemberTypes.length > 0) &&
					oRelationshipType.RelationshipTypeID === "2" &&
					oHierarchyItem.HierarchyLevel <= iMaxHierarchyLevel) {
					bApplicableRelationshipType = true;
				}

				//keep track of applicable relationship type
				if (bApplicableRelationshipType) {
					aApplicableRelationshipTypes.push({
						RelationshipTypeID: oRelationshipType.RelationshipTypeID,
						RelationshipTypeText: oRelationshipType.RelationshipTypeText
					});
				}

			}.bind(this));

			//feedback to caller
			return aApplicableRelationshipTypes;

		},

		//get node types that are applicable for this hierarchy item
		getApplicableNodeTypes: function(oHierarchyItem) {

			//local data declaration
			var bApplicableNodeType;
			var aApplicableNodeTypes = [];

			//get hierarchy metadata
			var oHierarchyMetaData = this.getModel("HierarchyMetaDataModel").getProperty("/");

			//derive all node types applicable for this hierarchy level as child
			oHierarchyMetaData.NodeDefinitions.forEach(function(oNodeDefinition) {

				//prepare for next loop pass
				bApplicableNodeType = false;

				//processing by relationship type
				switch (oHierarchyItem.RelationshipTypeID) {

					//bound OData node
					case undefined:

						//keep track of this node type as applicable child node type
						if (oHierarchyItem.HierarchyLevel + 1 === oNodeDefinition.HierarchyLevel) { //Child
							bApplicableNodeType = true;
						}
						break;

						//add unrelated root
					case "0":

						//unrelated insert on root level
						if (oNodeDefinition.HierarchyLevel === 0) { //Sibling
							bApplicableNodeType = true;
						}
						break;

						//add node as sibling
					case "1":

						//keep track of this node type as applicable sibling node type
						if (oHierarchyItem.oRelatedItem.HierarchyLevel === oNodeDefinition.HierarchyLevel) { //Sibling
							bApplicableNodeType = true;
						}
						break;

						//add node as child
					case "2":

						//keep track of this node type as applicable child node type
						if (oHierarchyItem.oRelatedItem.HierarchyLevel + 1 === oNodeDefinition.HierarchyLevel) { //Child
							bApplicableNodeType = true;
						}
						break;

				}

				//include applicable node type
				if (bApplicableNodeType) {
					oHierarchyMetaData.NodeTypes.forEach(function(oNodeType) {
						if (oNodeType.NodeTypeID === oNodeDefinition.NodeTypeID) {
							aApplicableNodeTypes.push({
								NodeTypeID: oNodeDefinition.NodeTypeID,
								NodeText: oNodeType.NodeTypeText
							});
						}
					});
				}

			});

			//feedback to caller
			return aApplicableNodeTypes;

		},

		//get member types that are applicable to enter into a relationship with the specified hierarchy item
		getApplicableMemberTypes: function(oHierarchyItem) {

			//local data declaration
			var bApplicableMemberType;
			var aApplicableMemberTypes = [];

			//get hierarchy metadata
			var oHierarchyMetaData = this.getModel("HierarchyMetaDataModel").getProperty("/");

			//derive all member types applicable for this hierarchy level as child
			oHierarchyMetaData.NodeMemberDefinitions.forEach(function(oNodeMemberDefinition) {

				//prepare for next loop pass
				bApplicableMemberType = false;

				//applicable member type: node type matches that of related item
				if (oHierarchyItem.oRelatedItem && oHierarchyItem.oRelatedItem.NodeTypeID === oNodeMemberDefinition.NodeTypeID) { //Sibling
					bApplicableMemberType = true;
				}

				//applicable member type: adding sibling of same type as related node
				if (oHierarchyItem.oRelatedItem && oHierarchyItem.oRelatedItem.HierarchyLevel === oHierarchyItem.HierarchyLevel &&
					oHierarchyItem.oRelatedItem.MemberTypeID === oNodeMemberDefinition.MemberTypeID) {
					bApplicableMemberType = true;
				}

				//applicable member type: for oHierarchyItem as target drop location
				if (oHierarchyItem.NodeTypeID === oNodeMemberDefinition.NodeTypeID) {
					bApplicableMemberType = true;
				}

				//include applicable node type
				if (bApplicableMemberType) {
					oHierarchyMetaData.MemberTypes.forEach(function(oMemberType) {
						if (oMemberType.MemberTypeID === oNodeMemberDefinition.MemberTypeID) {
							aApplicableMemberTypes.push({
								MemberTypeID: oNodeMemberDefinition.MemberTypeID,
								MemberTypeText: oMemberType.MemberTypeText
							});
						}
					});
				}

			});

			//feedback to caller
			return aApplicableMemberTypes;

		},

		//set applicable member types for hierarchy item
		setApplicableMemberTypes: function(oHierarchyItem) {

			//local data declaration
			var aMemberTypeFilters = [];
			var bInputMemberTypeIDEnabled = true;

			//no further processing where applicable
			if (oHierarchyItem.NodeCategoryID !== "2") {
				return;
			}

			//get access to member type select ui control
			var oMemberTypesBinding = sap.ui.getCore().byId("inputMemberTypeID").getBinding("items");

			//get applicable member types
			var aApplicableMemberTypes = this.getApplicableMemberTypes(oHierarchyItem);

			//build filter array of applicable member types			
			aApplicableMemberTypes.forEach(function(oMemberType) {
				aMemberTypeFilters.push(new Filter({
					path: "MemberTypeID",
					operator: "EQ",
					value1: oMemberType.MemberTypeID
				}));
			});

			//cater for the situation where no member type applicable
			if (aMemberTypeFilters.length === 0) {

				//indicate that member type ID entry should not be enabled
				bInputMemberTypeIDEnabled = false;

			}

			//apply filter to aggregation binding
			oMemberTypesBinding.filter(aMemberTypeFilters);

			//default member type in UI where only one applicable 
			if (aMemberTypeFilters.length === 1) {

				//default selected key to the one applicable member type
				sap.ui.getCore().byId("inputMemberTypeID").setSelectedKey(aMemberTypeFilters[0].oValue1);

			}

			//set enabled state of member type input UI control 
			sap.ui.getCore().byId("inputMemberTypeID").setEnabled(bInputMemberTypeIDEnabled);

		},

		//set applicable node categories
		setApplicableNodeCategories: function(oHierarchyItem) {

			//local data declaration
			var aNodeCategoryFilters = [];

			//get applicable node categories
			var aApplicableNodeCategories = this.getApplicableNodeCategories(oHierarchyItem);

			//get access to node categories select ui control
			var oNodeCategoriesBinding = sap.ui.getCore().byId("inputNodeCategoryID").getBinding("items");

			//build filter array of applicable node types			
			aApplicableNodeCategories.forEach(function(oNodeCategory) {
				aNodeCategoryFilters.push(new Filter({
					path: "NodeCategoryID",
					operator: "EQ",
					value1: oNodeCategory.NodeCategoryID
				}));
			});

			//default node category in UI where only one applicable node category
			if (aNodeCategoryFilters.length === 1) {

				//default selected key to the one applicable node category
				sap.ui.getCore().byId("inputNodeCategoryID").setSelectedKey(aNodeCategoryFilters[0].oValue1);

			}

			//where node category was input
			if (oHierarchyItem.aStable.indexOf("NodeCategoryID") >= 0) {

				//set correct node category for chosen node category
				switch (oHierarchyItem.NodeCategoryID) {

					//default 'sibling' relationship type
					case "1":
						sap.ui.getCore().byId("inputRelationshipTypeID").setSelectedKey("1");
						break;

						//default 'child' relationship type
					case "2":
						sap.ui.getCore().byId("inputRelationshipTypeID").setSelectedKey("2");
						break;

				}

			}

			//apply filter to select items aggregation binding
			oNodeCategoriesBinding.filter(aNodeCategoryFilters);

		},

		//set applicable relationship types
		setApplicableRelationshipTypes: function(oHierarchyItem) {

			//local data declaration
			var aRelationshipTypeFilters = [];

			//get applicable relationship types
			var aApplicableRelationshipTypes = this.getApplicableRelationshipTypes(oHierarchyItem);

			//get access to relationship type select ui control
			var oRelationshipTypesBinding = sap.ui.getCore().byId("inputRelationshipTypeID").getBinding("items");

			//build filter array of applicable relationship types			
			aApplicableRelationshipTypes.forEach(function(oRelationshipType) {
				aRelationshipTypeFilters.push(new Filter({
					path: "RelationshipTypeID",
					operator: "EQ",
					value1: oRelationshipType.RelationshipTypeID
				}));
			});

			//apply filter to select items aggregation binding
			oRelationshipTypesBinding.filter(aRelationshipTypeFilters);

			//default relationship type in UI where only one applicable
			if (aRelationshipTypeFilters.length === 1) {

				//default selected key to the one applicable node category
				sap.ui.getCore().byId("inputRelationshipTypeID").setSelectedKey(aRelationshipTypeFilters[0].oValue1);

			}

			//where relationship type was input
			if (oHierarchyItem.aStable.indexOf("RelationshipTypeID") >= 0) {

				//set correct node category for chosen relationship type
				switch (oHierarchyItem.RelationshipTypeID) {

					//default 'branch' node category
					case "1":

						//get applicable node types
						var aApplicableNodeTypes = this.getApplicableNodeTypes(oHierarchyItem);

						//default branch node category
						if (aApplicableNodeTypes.length > 0) {
							sap.ui.getCore().byId("inputNodeCategoryID").setSelectedKey("1");
						}
						break;

						//default 'member' node category
					case "2":

						//get applicable member types
						var aApplicableMemberTypes = this.getApplicableMemberTypes(oHierarchyItem);

						//default member node category
						if (aApplicableMemberTypes.length > 0) {
							sap.ui.getCore().byId("inputNodeCategoryID").setSelectedKey("2");
						}
						break;

				}

			}

		},

		//set applicable node types
		setApplicableNodeTypes: function(oHierarchyItem) {

			//local data declaration
			var aNodeTypeFilters = [];
			var bInputNodeTypeIDEnabled = true;

			//get applicable node types
			var aApplicableNodeTypes = this.getApplicableNodeTypes(oHierarchyItem);

			//get access to node type select ui control
			var oNodeTypesBinding = sap.ui.getCore().byId("inputNodeTypeID").getBinding("items");

			//build filter array of applicable node types			
			aApplicableNodeTypes.forEach(function(oNodeType) {
				aNodeTypeFilters.push(new Filter({
					path: "NodeTypeID",
					operator: "EQ",
					value1: oNodeType.NodeTypeID
				}));
			});

			//default node type in UI where only one applicable node type 
			if (aNodeTypeFilters.length === 1) {

				//default selected key to the one applicable node type
				sap.ui.getCore().byId("inputNodeTypeID").setSelectedKey(aNodeTypeFilters[0].oValue1);

			}

			//cater for the situation where no node type applicable or requested node is leaf
			if (aNodeTypeFilters.length === 0 || oHierarchyItem.NodeCategoryID === "2") {

				//indicate that node type ID entry should not be enabled
				bInputNodeTypeIDEnabled = false;

				//switch node category to member
				sap.ui.getCore().byId("inputNodeCategoryID").setSelectedKey("2");

				//set applicable member types
				this.setApplicableMemberTypes(oHierarchyItem);

			}

			//set enabled state of node type input UI control 
			sap.ui.getCore().byId("inputNodeTypeID").setEnabled(bInputNodeTypeIDEnabled);

			//apply filter to select items aggregation binding
			oNodeTypesBinding.filter(aNodeTypeFilters);

		},

		//set applicable hierarchy metadata filters
		setApplicableHierarchyMetaDataFilter: function(oHierarchyItem, sAnchorAttribute) {

			//keep track of stable hierarchy item attribute
			oHierarchyItem.aStable = [];
			oHierarchyItem.aStable.push(sAnchorAttribute);

			//do hierarchy item attribute value derivation
			this.setApplicableNodeCategories(oHierarchyItem);
			this.setApplicableRelationshipTypes(oHierarchyItem);
			this.setApplicableMemberTypes(oHierarchyItem);
			this.setApplicableNodeTypes(oHierarchyItem);

		},

		//is allowable node drop location
		isAllowableNodeDropLocation: function(oNode, oTargetNode) {

			//local data declaration
			var bIsAllowable = false;

			//get applicable node types allowed for children of this target node
			var aApplicableNodeTypes = this.getApplicableNodeTypes(oTargetNode);

			//verify whether incoming node meets node type requirements
			aApplicableNodeTypes.forEach(function(oApplicableNodeType) {
				if (oApplicableNodeType.NodeTypeID === oNode.NodeTypeID) {
					bIsAllowable = true;
				}
			});

			//get applicable member types allowed for children of this target node
			var aApplicableMemberTypes = this.getApplicableMemberTypes(oTargetNode);

			//verify whether incoming node meets member type requirements
			aApplicableMemberTypes.forEach(function(oApplicableMemberType) {
				if (oApplicableMemberType.MemberTypeID === oNode.MemberTypeID) {
					bIsAllowable = true;
				}
			});

			//reaching this point means not an allowable drop location
			return bIsAllowable;

		},

		//on add node
		onAddHierarchyItem: function() {

			//local data declaration
			var bSelectedNodeTextVisible = true;
			var bRelationshipTypeVisible = true;
			var bNodeCategoryEnabled = true;

			//prepare view for next action
			this.prepareViewForNextAction();

			//get node instance on which to add
			var oHierarchyTree = this.getView().byId("TreeTable");
			var iSelectedIndex = oHierarchyTree.getSelectedIndex();

			//create popover to add new hiearchy item
			var oHierarchyItemAddDialog = sap.ui.xmlfragment("pnp.hierarchyeditor.fragment.HierarchyItemAdd", this);
			oHierarchyItemAddDialog.attachAfterClose(function() {
				oHierarchyItemAddDialog.destroy();
			});
			this.getView().addDependent(oHierarchyItemAddDialog);

			//set popover to not busy
			this.getModel("HierarchyViewModel").setProperty("/isHierarchyItemAddPopoverBusy", false);

			//instantiate new hierarchy node item with default attributes
			var oHierarchyItem = {
				"NodeText": "",
				"NodeTypeID": null,
				"MemberTypeID": null
			};

			//where a tree table row has been selected
			if (iSelectedIndex >= 0) {

				//keep track of relationship to the selected hierarchy item
				oHierarchyItem.oRelatedItem = oHierarchyTree.getContextByIndex(iSelectedIndex).getObject();

				//set ViewModel attributes that are bound on popover
				this.oViewModel.setProperty("/sSelectedNodeText", oHierarchyItem.oRelatedItem.NodeText);

				//default new hierarchy item as child node
				oHierarchyItem.NodeCategoryID = "1"; //Branch
				oHierarchyItem.RelationshipTypeID = "2"; //Child'

				//where selected node is of type 'leaf'
				if (oHierarchyItem.oRelatedItem.NodeCategoryID === "2") {
					oHierarchyItem.NodeCategoryID = "2"; //Leaf
					oHierarchyItem.RelationshipTypeID = "1"; //Sibling					
				}

				//get max hierarchy level
				var iMaxHierarchyLevel = this.getModel("HierarchyMetaDataModel").getProperty("/MaxHierarchyLevel");

				//increment hierarchy level as item defaulted to assume child relation
				oHierarchyItem.HierarchyLevel = oHierarchyItem.oRelatedItem.HierarchyLevel;
				if (oHierarchyItem.oRelatedItem.HierarchyLevel < iMaxHierarchyLevel) {
					oHierarchyItem.HierarchyLevel = oHierarchyItem.HierarchyLevel + 1;
				}

				//keep track of this relationship type as 'previous
				oHierarchyItem.PreviousRelationshipTypeID = oHierarchyItem.RelationshipTypeID;

			}

			//where no hierarchy table entry is selected
			if (iSelectedIndex === -1) {

				//set selected node text input to invisible
				bSelectedNodeTextVisible = false;
				bRelationshipTypeVisible = false;
				bNodeCategoryEnabled = false;

				//new node is a root node
				oHierarchyItem.NodeCategoryID = "0"; //root node
				oHierarchyItem.RelationshipTypeID = "0"; //unrelated
				oHierarchyItem.HierarchyLevel = 0;

			}

			//default to 'create new' hierarchy item
			oHierarchyItem.NewOrExistingHierarchyItem = "0"; //Create new

			//make available new hierarchy item for binding
			this.oViewModel.setProperty("/NewItem", oHierarchyItem);

			//bind popover to view model instance 
			oHierarchyItemAddDialog.bindElement({
				model: "HierarchyViewModel",
				path: "/NewItem"
			});

			//set visibility of input control for selected node text
			this.getModel("HierarchyViewModel").setProperty("/bSelectedNodeTextVisible", bSelectedNodeTextVisible);

			//set visibility of input control for relationship type
			this.getModel("HierarchyViewModel").setProperty("/bRelationshipTypeVisible", bRelationshipTypeVisible);

			//set enabled state of input control for node category
			this.getModel("HierarchyViewModel").setProperty("/bNodeCategoryEnabled", bNodeCategoryEnabled);

			//set applicable hierarchy metadata filters
			this.setApplicableHierarchyMetaDataFilter(oHierarchyItem, "HierarchyLevel");

			//open hierarchy item add dialog
			oHierarchyItemAddDialog.open();

		},

		//on live change of adding hierarchy item
		onHierarchyItemAddInputChange: function(oEvent) {

			//get UI control that triggered the input
			var oUiControl = oEvent.getSource();

			//reset value state to 'None' where input available
			if (oUiControl.getValue && oUiControl.getValue()) {
				oUiControl.setValueState(sap.ui.core.ValueState.None);
			}

			//hide popover message strip
			sap.ui.getCore().byId("msHierarchyAddPopOverMessageStrip").setVisible(false);

		},

		//on closing the hierarchy item add popover
		onCloseHierarchyItemAddDialog: function() {

			//close hierarchy item add popover
			sap.ui.getCore().byId("dialogHierarchyItemAdd").close();

		},

		//on confirm to add new hierarchy item(s)
		onConfirmHierarchyItemAddDialog: function() {

			//message handling: invalid form input where applicable
			if (this.hasMissingInput([sap.ui.getCore().byId("formHierarchyItemAdd")]).length > 0) {

				//message handling: incomplete form input detected
				this.sendStripMessage(this.getResourceBundle().getText("messageInputCheckedWithErrors"),
					sap.ui.core.MessageType.Error, sap.ui.getCore().byId("msHierarchyAddPopOverMessageStrip"));

				//no further processing at this point
				return;

			}

			//retrieve new item for hierarchy insert
			var oNewHierarchyItem = this.getModel("HierarchyViewModel").getProperty("/NewItem");

			//create hierarchy item with newly defined member
			if (oNewHierarchyItem.NewOrExistingHierarchyItem === "0") {
				this.createHierarchyItem(oNewHierarchyItem);
			}

			//create hierarchy item with existing member(s)
			if (oNewHierarchyItem.NewOrExistingHierarchyItem === "1") {

				//get array of unassigned hierarchy members
				var aUnassignedHierarchyMembers = this.getModel("HierarchyViewModel").getProperty("/UnassignedHierarchyMembers");

				//create new hierarchy item for each selected existing member
				oNewHierarchyItem.SelectedHierarchyMembers.forEach(function(sExternalEntityID) {

					//clone hierarchy item for create
					var oHierarchyItem = {};
					Object.getOwnPropertyNames(oNewHierarchyItem).forEach(function(sPropertyName) {
						oHierarchyItem[sPropertyName] = oNewHierarchyItem[sPropertyName];
					});

					//adopt external ID of the selected member
					oHierarchyItem.ExternalEntityID = sExternalEntityID;

					//adopt text of this existing member as node text
					aUnassignedHierarchyMembers.forEach(function(oUnassignedHierarchyMember) {
						if (oUnassignedHierarchyMember.ExternalEntityID === sExternalEntityID) {
							oHierarchyItem.NodeText = oUnassignedHierarchyMember.MemberText;
						}
					});

					//request creation of this hierarchy member
					this.createHierarchyItem(oHierarchyItem);

				}.bind(this));

			}

		},

		//create hierarchyitem
		createHierarchyItem: function(oHierarchyItem) {

			//get access to tree table instance
			var oHierarchyTable = this.getView().byId("TreeTable");

			//get hierarchy bound to view
			var oHierarchy = this.getView().getBindingContext("HierarchyModel").getObject();

			//set node key information
			oHierarchyItem.HierarchyID = oHierarchy.HierarchyID;
			oHierarchyItem.HierarchyNodeID = this.getGUID();

			//create a sibling or child
			switch (oHierarchyItem.RelationshipTypeID) {
				case "1": //Sibling
					oHierarchyItem.ParentNodeID = oHierarchyItem.oRelatedItem.ParentNodeID;
					oHierarchyItem.HierarchyLevel = oHierarchyItem.oRelatedItem.HierarchyLevel;
					break;
				case "2": //Child
					oHierarchyItem.ParentNodeID = oHierarchyItem.oRelatedItem.HierarchyNodeID;
					oHierarchyItem.HierarchyLevel = oHierarchyItem.oRelatedItem.HierarchyLevel + 1;
					break;
			}

			//build member attributes where applicable
			switch (oHierarchyItem.NodeCategoryID) {

				//node of type root or inner node
				case "0":
				case "1":
					delete oHierarchyItem.MemberTypeID;
					break;

					//node of type leaf
				case "2":
					delete oHierarchyItem.NodeTypeID;
					break;
			}

			//remove item properties that do not exist in backend
			delete oHierarchyItem.PreviousRelationshipTypeID;
			delete oHierarchyItem.NewOrExistingHierarchyItem;
			delete oHierarchyItem.SelectedHierarchyMembers;
			delete oHierarchyItem.RelationshipTypeID;
			delete oHierarchyItem.oRelatedItem;
			delete oHierarchyItem.aStable;

			//close hierarchy item add popover where it is open
			var oHierarchyItemAddDialog = sap.ui.getCore().byId("dialogHierarchyItemAdd");
			if (oHierarchyItemAddDialog) {
				oHierarchyItemAddDialog.close();
			}

			//get current tree state of expanded and collapsed nodes
			var oBinding = oHierarchyTable.getBinding();
			var oCurrentTreeState = oBinding.getCurrentTreeState();

			//create this node on the backend
			this.getModel("HierarchyModel").create("/HierarchyNodes", oHierarchyItem, {

				//sending each create in own groupId
				groupId: this.getGUID(),

				//success handler for delete
				success: function(oData) {

					//reapply previous tree state as otherwise all nodes will be collapsed after refresh
					oBinding.setTreeState(oCurrentTreeState);

					//message handling: successfully created
					this.sendToastMessage(this.getResourceBundle().getText("msgNodeCreatedSuccessfully"));

				}.bind(this),

				//error handler for delete
				error: function(oError) {

					//reapply previous tree state as otherwise all nodes will be collapsed after refresh
					oBinding.setTreeState(oCurrentTreeState);

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//on delete node
		onDeleteHierarchyItem: function(oEvent) {

			//local data declarations
			var aActions = [];
			var bDelete = false;
			var sConfirmationText;

			//prepare view for next action
			this.prepareViewForNextAction();

			//get node instance being deleted
			var oHierarchyTable = this.getView().byId("TreeTable");
			var iSelectedIndex = oHierarchyTable.getSelectedIndex();

			//message handling: no row selected
			if (iSelectedIndex === -1) {

				//message handling: select a row
				this.sendBoxMessage(this.getResourceBundle().getText("msgSelectARowFirst"), sap.ui.core.MessageType.Warning);

				//no further processing
				return;

			}

			//get binding context of node to be deleted
			var oNodeBindingContext = oHierarchyTable.getContextByIndex(iSelectedIndex);

			//build confirmation text for hierarchy node deletion
			var oNode = oNodeBindingContext.getObject();
			
			//set actions and confirmation text for root and branch node
			if (oNode.NodeCategoryID === "0" || oNode.NodeCategoryID === "1") {

				//allow 'delete' action only
				aActions.push(this.getResourceBundle().getText("butTextDeleteHierarchyNode"));

				//build confirmation text
				sConfirmationText = "Do you really want to delete '" + oNode.NodeText + "'?";

			}

			//set actions and confirmation text leaf node
			if (oNode.NodeCategoryID === "2") {

				//allow 'delete' and 'unassign' only actions
				aActions.push(this.getResourceBundle().getText("butTextDeleteHierarchyNode"));
				aActions.push(this.getResourceBundle().getText("butTextUnassignHierarchyNode"));

				//build confirmation text
				sConfirmationText = "Do you want to delete or just unassign " + "'" + oNode.NodeText + "'?";

			}

			//override action and confirmation text where node is unassigned
			if (oNode.Unassigned) {

				//allow 'delete' action only
				aActions = [this.getResourceBundle().getText("butTextDeleteHierarchyNode")];

				//build confirmation text
				sConfirmationText = "Do you really want to delete '" + oNode.NodeText + "'?";

			}

			//'cancel' action is always available
			aActions.push(sap.m.MessageBox.Action.CANCEL);

			//confirmation dialog to delete this hierarchy
			sap.m.MessageBox.confirm(sConfirmationText, {

				//actions offered
				actions: aActions,

				//on confirmation dialog close
				onClose: function(sAction) {

					//user choice: proceed with deletion
					if (sAction === this.getResourceBundle().getText("butTextUnassignHierarchyNode") ||
						sAction === this.getResourceBundle().getText("butTextDeleteHierarchyNode")) {

						//get path to selected node in OData model
						var sNodePath = oNodeBindingContext.getPath();

						//get current tree state of expanded and collapsed nodes
						var oBinding = oHierarchyTable.getBinding();
						var oCurrentTreeState = oBinding.getCurrentTreeState();

						//provide url parameter to disguish between unassign or delete
						switch (sAction) {
							case this.getResourceBundle().getText("butTextUnassignHierarchyNode"):
								bDelete = false;
								break;
							case this.getResourceBundle().getText("butTextDeleteHierarchyNode"):
								bDelete = true;
								break;
						}
						
						//remove this node from the backend
						this.getModel("HierarchyModel").remove(sNodePath, {

							//pass node attributes as gateway only provides entity key for delete
							headers: {
								"externalentityid": oNode.ExternalEntityID,
								"unassignednode": oNode.Unassigned,
								"membertypeid": oNode.MemberTypeID,
								"deletenode": bDelete
							},

							//success handler for delete
							success: function() {

								//reapply previous tree state as otherwise all nodes will be collapsed after refresh
								oBinding.setTreeState(oCurrentTreeState);

								//message handling: successfully deleted
								this.sendToastMessage(this.getResourceBundle().getText("msgNodeRemovedSuccessfully"));

								//unbind attributes view in connected hierarchy component
								this.getOwnerComponent().unbindAttributesView();

								//change flexible column layout
								this.getModel("AppViewModel").setProperty("/layout", "TwoColumnsMidExpanded");

							}.bind(this),

							//error handler for delete
							error: function(oError) {

								//reapply previous tree state as otherwise all nodes will be collapsed after refresh
								oBinding.setTreeState(oCurrentTreeState);

								//render OData error response
								this.renderODataErrorResponseToMessagePopoverButton(oError);

							}.bind(this)

						});

					}

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

		},

		//on assigned filters changed
		onAssignedFiltersChanged: function() {

		},

		//on hierarchy row selection change
		onHierarchyRowSelectionChange: function(oEvent) {

		},

		//on row action 'Navigate'
		onRowActionNavigate: function(oEvent) {

			//prepare view for next action
			this.prepareViewForNextAction();

			//get row from which to navigate
			var oRow = oEvent.getParameter("row");

			//identify selected row
			var oHierarchyItem = oRow.getBindingContext("HierarchyModel").getObject();

			//change flexible column layout
			this.getModel("AppViewModel").setProperty("/layout", "ThreeColumnsMidExpanded");

			//set row as selected
			this.getView().byId("TreeTable").setSelectedIndex(oRow.getIndex());

			//display detail corresponding to the hierarchy
			this.getRouter().getTargets().display("Attributes", {
				HierarchyComponent: this.getOwnerComponent(),
				HierarchyItem: oHierarchyItem
			});

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

		},

		//toggle facet filter
		onPressToggleFacetFilter: function() {

			//get current facet filter visibility state
			var bFacetFilterVisible = this.getView().getModel("HierarchyViewModel").getProperty("/isFacetFilterVisible");

			//toggle facet filter visibility property
			this.getView().getModel("HierarchyViewModel").setProperty("/isFacetFilterVisible", !bFacetFilterVisible);

			//get OData model for service hierarchy
			var oServiceHierarchyModel = this.getModel("ServiceHierarchyModel");

			//create service hierarchy filter model
			oServiceHierarchyModel.metadataLoaded().then(function(oEvent) {
				this.createHierarchyFilterModel(oEvent);
			}.bind(this));

		},

		//handle facet filter list close event
		handleFacetFilterClose: function(oEvent) {

			//Get access to facet filter 
			var oFacetFilter = this.getView().byId("idFacetFilter");

			//Apply facet filter to hierarchy model
			this.filterHierarchyModel(oFacetFilter);

		},

		//clear all filter entries
		handleFacetFilterReset: function(oEvent) {

			//get access to facet filter
			var oFacetFilter = sap.ui.getCore().byId(oEvent.getParameter("id"));

			//reset requested facet filter
			this.resetFacetFilter(oFacetFilter);

		},

		//reset facet filter
		resetFacetFilter: function(oFacetFilter) {

			//get filter criteria contained in facet filter
			var aFacetFilterLists = oFacetFilter.getLists();

			//for each facet filter entry
			aFacetFilterLists.forEach(function(oFacetFilterList) {
				oFacetFilterList.setSelectedKeys();
			});

			//unfilter node display for current hierarchy
			this.applyFacetFilter(null);

		},

		//filter hierarchy model
		filterHierarchyModel: function(oFacetFilter) {

			//get a map of all filter criteria
			var mFacetFilterLists = oFacetFilter.getLists().filter(function(oList) {
				return oList.getSelectedItems().length;
			});

			//where filter entries were made
			if (mFacetFilterLists.length > 0) {

				//Build nested filter with ORs between values of each group and ANDs between each group
				var oFilter = new Filter(mFacetFilterLists.map(function(oList) {
					return new Filter(oList.getSelectedItems().map(function(oItem) {
						return new Filter(oList.getKey(), "EQ", oItem.getKey());
					}), false);
				}), true);

				//apply newly constructed nested filter
				this.applyFacetFilter(oFilter);

			}

			//where no filter entries were made
			if (mFacetFilterLists.length === 0) {

				//unfilter hierarchy display
				this.applyFacetFilter(null);

			}

		},

		//apply facet filter
		applyFacetFilter: function(oFilter) {

			//get current binding context
			var oBindingContext = this.getView().getBindingContext("HierarchyModel");

			//no further processing where applicable
			if (!oBindingContext) {
				return;
			}

			//get hierarchy currently displayed
			var oHierarchy = this.getView().getBindingContext("HierarchyModel").getObject();

			//componse hierarchy ID filter
			var oHierarchyIDFilter = new Filter({
				path: "HierarchyID",
				operator: "EQ",
				value1: oHierarchy.HierarchyID
			});

			//include hierarchy ID filter in facet filters
			if (oFilter) {
				oFilter.aFilters.push(oHierarchyIDFilter);
			} else {
				oFilter = oHierarchyIDFilter;
			}

			//depending on filter info provided
			this.bindHierarchyTreeTable(oFilter);

		},

		//create service hierarchy filter model
		createHierarchyFilterModel: function(oEvent) {

			//no further action where filter model already created
			if (this.getView().getModel("HierarchyFilterModel")) {
				return;
			}

			//get all people defined as possible filter values
			this.getOwnerComponent().getModel("ServiceHierarchyModel").read("/Filters", {

				//url parameters
				urlParameters: {
					"$expand": "toFilterOptions"
				},

				//success handler
				success: function(oData) {

					//inspect batchResponses for errors and visualize
					if (this.hasODataBatchErrorResponse(oData.__batchResponses)) {
						return;
					}

					//remove 'results' array from FilterOptions
					var oFilter = {};
					var aFilters = [];
					var aFilterOptions = [];
					oData.results.forEach(function(oResult) {

						//extract filter options for this filter
						aFilterOptions = oResult.toFilterOptions.results;

						//remove 'deep' FilterOptions property
						delete oResult.toFilterOptions;

						//adopt filter attributes
						oFilter = oResult;

						//inject filter 'flat' filter options
						oFilter.toFilterOptions = aFilterOptions;

						//keep track of this filter incl. filter option
						aFilters.push(oFilter);

					});

					//add 'Status' filter
					aFilters.push({
						"FilterID": "Unassigned",
						"FilterText": "Status",
						"toFilterOptions": [{
							"FilterOptionValue": true,
							"FilterOptionText": "Unassigned"
						}]
					});

					//create new JSON Model
					var oHierarchyFilterModel = new JSONModel({
						Filters: aFilters
					});

					//set JSON model to view
					this.getView().setModel(oHierarchyFilterModel, "HierarchyFilterModel");

				}.bind(this),

				//error handler
				error: function(oError) {

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		},

		//on change of new or existing hierarchy item add
		onChangeAddNewOrExistingHierarchyItem: function(oEvent) {

			//get selected option
			var sSelectedKey = oEvent.getSource().getSelectedKey();

			//no further processing where 'create new' was selected
			if (sSelectedKey === '0') {
				return;
			}

			//get hierarchy currently displayed
			var oHierarchy = this.getView().getBindingContext("HierarchyModel").getObject();

			//retrieve new item for hierarchy item add
			var oNewHierarchyItem = this.getModel("HierarchyViewModel").getProperty("/NewItem");

			//set view to busy
			this.getModel("HierarchyViewModel").setProperty("/isHierarchyItemAddPopoverBusy", true);

			//read hierarchy model members entity set
			this.getModel("HierarchyModel").read("/HierarchyMembers", {

				//filters
				filters: [new Filter({
					path: "HierarchyID",
					operator: "EQ",
					value1: oHierarchy.HierarchyID
				}), new Filter({
					path: "MemberTypeID",
					operator: "EQ",
					value1: oNewHierarchyItem.MemberTypeID
				}), new Filter({
					path: "Unassigned",
					operator: "EQ",
					value1: true
				})],

				//success callback function
				success: function(oData) {

					//start with empty array as default
					this.getModel("HierarchyViewModel").setProperty("/UnassignedHierarchyMembers", []);

					//set backend member information where applicable
					if (oData && Array.isArray(oData.results)) {
						this.getModel("HierarchyViewModel").setProperty("/UnassignedHierarchyMembers", oData.results);
					}

					//set view to no longer busy
					this.getModel("HierarchyViewModel").setProperty("/isHierarchyItemAddPopoverBusy", false);

				}.bind(this),

				//error callback function
				error: function(oError) {

					//close hierarchy item add popover
					sap.ui.getCore().byId("dialogHierarchyItemAdd").close();

					//render OData error response
					this.renderODataErrorResponseToMessagePopoverButton(oError);

				}.bind(this)

			});

		}

	});

});