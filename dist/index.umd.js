(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tiptap/core'), require('@tiptap/pm/state'), require('@tiptap/pm/model'), require('@tiptap/pm/view')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tiptap/core', '@tiptap/pm/state', '@tiptap/pm/model', '@tiptap/pm/view'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["tiptap-extension-global-drag-handle"] = {}, global.core, global.state, global.model, global.view));
})(this, (function (exports, core, state, model, view) { 'use strict';

  function absoluteRect(node) {
      const data = node.getBoundingClientRect();
      const modal = node.closest('[role="dialog"]');
      if (modal && window.getComputedStyle(modal).transform !== 'none') {
          const modalRect = modal.getBoundingClientRect();
          return {
              top: data.top - modalRect.top,
              left: data.left - modalRect.left,
              width: data.width,
          };
      }
      return {
          top: data.top,
          left: data.left,
          width: data.width,
      };
  }
  function nodeDOMAtCoords(coords) {
      return document
          .elementsFromPoint(coords.x, coords.y)
          .find((elem) => elem.parentElement?.matches?.('.ProseMirror') ||
          elem.matches([
              'li',
              'p:not(:first-child)',
              'pre',
              'blockquote',
              'h1, h2, h3, h4, h5, h6',
          ].join(', ')));
  }
  function nodePosAtDOM(node, view, options) {
      const boundingRect = node.getBoundingClientRect();
      return view.posAtCoords({
          left: boundingRect.left + 50 + options.dragHandleWidth,
          top: boundingRect.top + 1,
      })?.inside;
  }
  function calcNodePos(pos, view) {
      const $pos = view.state.doc.resolve(pos);
      if ($pos.depth > 1)
          return $pos.before($pos.depth);
      return pos;
  }
  function DragHandlePlugin(options) {
      let listType = '';
      function handleDragStart(event, view$1) {
          view$1.focus();
          if (!event.dataTransfer)
              return;
          const node = nodeDOMAtCoords({
              x: event.clientX + 50 + options.dragHandleWidth,
              y: event.clientY,
          });
          if (!(node instanceof Element))
              return;
          let draggedNodePos = nodePosAtDOM(node, view$1, options);
          if (draggedNodePos == null || draggedNodePos < 0)
              return;
          draggedNodePos = calcNodePos(draggedNodePos, view$1);
          const { from, to } = view$1.state.selection;
          const diff = from - to;
          const fromSelectionPos = calcNodePos(from, view$1);
          let differentNodeSelected = false;
          const nodePos = view$1.state.doc.resolve(fromSelectionPos);
          // Check if nodePos points to the top level node
          if (nodePos.node().type.name === 'doc')
              differentNodeSelected = true;
          else {
              const nodeSelection = state.NodeSelection.create(view$1.state.doc, nodePos.before());
              // Check if the node where the drag event started is part of the current selection
              differentNodeSelected = !(draggedNodePos + 1 >= nodeSelection.$from.pos &&
                  draggedNodePos <= nodeSelection.$to.pos);
          }
          let selection = view$1.state.selection;
          if (!differentNodeSelected &&
              diff !== 0 &&
              !(view$1.state.selection instanceof state.NodeSelection)) {
              const endSelection = state.NodeSelection.create(view$1.state.doc, to - 1);
              selection = state.TextSelection.create(view$1.state.doc, draggedNodePos, endSelection.$to.pos);
          }
          else {
              selection = state.NodeSelection.create(view$1.state.doc, draggedNodePos);
              // if inline node is selected, e.g mention -> go to the parent node to select the whole node
              // if table row is selected, go to the parent node to select the whole node
              if (selection.node.type.isInline ||
                  selection.node.type.name === 'tableRow') {
                  let $pos = view$1.state.doc.resolve(selection.from);
                  selection = state.NodeSelection.create(view$1.state.doc, $pos.before());
              }
          }
          view$1.dispatch(view$1.state.tr.setSelection(selection));
          // If the selected node is a list item, we need to save the type of the wrapping list e.g. OL or UL
          if (view$1.state.selection instanceof state.NodeSelection &&
              view$1.state.selection.node.type.name === 'listItem') {
              listType = node.parentElement.tagName;
          }
          const slice = view$1.state.selection.content();
          const { dom, text } = view.__serializeForClipboard(view$1, slice);
          event.dataTransfer.clearData();
          event.dataTransfer.setData('text/html', dom.innerHTML);
          event.dataTransfer.setData('text/plain', text);
          event.dataTransfer.effectAllowed = 'copyMove';
          event.dataTransfer.setDragImage(node, 0, 0);
          view$1.dragging = { slice, move: event.ctrlKey };
      }
      let dragHandleElement = null;
      function hideDragHandle() {
          if (dragHandleElement) {
              dragHandleElement.classList.add('hide');
          }
      }
      function showDragHandle() {
          if (dragHandleElement) {
              dragHandleElement.classList.remove('hide');
          }
      }
      function hideHandleOnEditorOut(event) {
          if (event.target instanceof Element) {
              const isInsideEditor = !!event.target.closest('.tiptap.ProseMirror');
              const isHandle = !!!event.target.attributes.getNamedItem('data-drag-handle');
              const relatedTarget = event.relatedTarget;
              // Check if the relatedTarget class is tiptap
              const isTipTap = relatedTarget?.classList.contains('tiptap') ||
                  relatedTarget?.classList.contains('drag-handle');
              if (!isTipTap) {
                  hideDragHandle();
                  return;
              }
              if (isInsideEditor || isHandle)
                  return;
          }
          hideDragHandle();
      }
      return new state.Plugin({
          key: new state.PluginKey(options.pluginKey),
          view: (view) => {
              const handleBySelector = options.dragHandleSelector
                  ? document.querySelector(options.dragHandleSelector)
                  : null;
              dragHandleElement = handleBySelector ?? document.createElement('div');
              dragHandleElement.draggable = true;
              dragHandleElement.dataset.dragHandle = '';
              dragHandleElement.classList.add('drag-handle');
              function onDragHandleDragStart(e) {
                  handleDragStart(e, view);
              }
              dragHandleElement.addEventListener('dragstart', onDragHandleDragStart);
              function onDragHandleDrag(e) {
                  hideDragHandle();
                  let scrollY = window.scrollY;
                  if (e.clientY < options.scrollTreshold) {
                      window.scrollTo({ top: scrollY - 30, behavior: 'smooth' });
                  }
                  else if (window.innerHeight - e.clientY < options.scrollTreshold) {
                      window.scrollTo({ top: scrollY + 30, behavior: 'smooth' });
                  }
              }
              dragHandleElement.addEventListener('drag', onDragHandleDrag);
              hideDragHandle();
              if (!handleBySelector) {
                  view?.dom?.parentElement?.appendChild(dragHandleElement);
              }
              view?.dom?.parentElement?.addEventListener('mouseout', hideHandleOnEditorOut);
              return {
                  destroy: () => {
                      if (!handleBySelector) {
                          dragHandleElement?.remove?.();
                      }
                      dragHandleElement?.removeEventListener('drag', onDragHandleDrag);
                      dragHandleElement?.removeEventListener('dragstart', onDragHandleDragStart);
                      dragHandleElement = null;
                      view?.dom?.parentElement?.removeEventListener('mouseout', hideHandleOnEditorOut);
                  },
              };
          },
          props: {
              handleDOMEvents: {
                  mousemove: (view, event) => {
                      if (!view.editable) {
                          return;
                      }
                      const node = nodeDOMAtCoords({
                          x: event.clientX + 50 + options.dragHandleWidth,
                          y: event.clientY,
                      });
                      const notDragging = node?.closest('.not-draggable');
                      const excludedTagList = options.excludedTags
                          .concat(['ol', 'ul'])
                          .join(', ');
                      if (!(node instanceof Element) ||
                          node.matches(excludedTagList) ||
                          notDragging) {
                          hideDragHandle();
                          return;
                      }
                      const compStyle = window.getComputedStyle(node);
                      const parsedLineHeight = parseInt(compStyle.lineHeight, 10);
                      const lineHeight = isNaN(parsedLineHeight)
                          ? parseInt(compStyle.fontSize) * 1.2
                          : parsedLineHeight;
                      const paddingTop = parseInt(compStyle.paddingTop, 10);
                      const rect = absoluteRect(node);
                      rect.top += (lineHeight - 24) / 2;
                      rect.top += paddingTop;
                      // Li markers
                      if (node.matches('ul:not([data-type=taskList]) li, ol li')) {
                          rect.left -= options.dragHandleWidth;
                      }
                      rect.width = options.dragHandleWidth;
                      if (!dragHandleElement)
                          return;
                      dragHandleElement.style.left = `${rect.left - rect.width}px`;
                      dragHandleElement.style.top = `${rect.top}px`;
                      showDragHandle();
                  },
                  keydown: () => {
                      hideDragHandle();
                  },
                  mousewheel: () => {
                      hideDragHandle();
                  },
                  // dragging class is used for CSS
                  dragstart: (view) => {
                      view.dom.classList.add('dragging');
                  },
                  drop: (view, event) => {
                      view.dom.classList.remove('dragging');
                      hideDragHandle();
                      let droppedNode = null;
                      const dropPos = view.posAtCoords({
                          left: event.clientX,
                          top: event.clientY,
                      });
                      if (!dropPos)
                          return;
                      if (view.state.selection instanceof state.NodeSelection) {
                          droppedNode = view.state.selection.node;
                      }
                      if (!droppedNode)
                          return;
                      const resolvedPos = view.state.doc.resolve(dropPos.pos);
                      const isDroppedInsideList = resolvedPos.parent.type.name === 'listItem';
                      // If the selected node is a list item and is not dropped inside a list, we need to wrap it inside <ol> tag otherwise ol list items will be transformed into ul list item when dropped
                      if (view.state.selection instanceof state.NodeSelection &&
                          view.state.selection.node.type.name === 'listItem' &&
                          !isDroppedInsideList &&
                          listType == 'OL') {
                          const newList = view.state.schema.nodes.orderedList?.createAndFill(null, droppedNode);
                          const slice = new model.Slice(model.Fragment.from(newList), 0, 0);
                          view.dragging = { slice, move: event.ctrlKey };
                      }
                  },
                  dragend: (view) => {
                      view.dom.classList.remove('dragging');
                  },
              },
          },
      });
  }
  const GlobalDragHandle = core.Extension.create({
      name: 'globalDragHandle',
      addOptions() {
          return {
              dragHandleWidth: 20,
              scrollTreshold: 100,
              excludedTags: [],
          };
      },
      addProseMirrorPlugins() {
          return [
              DragHandlePlugin({
                  pluginKey: 'globalDragHandle',
                  dragHandleWidth: this.options.dragHandleWidth,
                  scrollTreshold: this.options.scrollTreshold,
                  dragHandleSelector: this.options.dragHandleSelector,
                  excludedTags: this.options.excludedTags,
              }),
          ];
      },
  });

  exports.DragHandlePlugin = DragHandlePlugin;
  exports["default"] = GlobalDragHandle;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.umd.js.map
