/*
var wysihtml5ParserRules = {
*/
    /**
     * CSS Class white-list
     * Following css classes won't be removed when parsed by the wysihtml5 html parser
     */
     /*
    "classes": {

    },
    */
    /**
     * Tag list
     *
     * Following options are available:
     *
     *    - add_class:        converts and deletes the given HTML4 attribute (align, clear, ...) via the given method to a css class
     *                        The following methods are implemented in wysihtml5.dom.parse:
     *                          - align_text:  converts align attribute values (right/left/center/justify) to their corresponding css class "wysiwyg-text-align-*")
                                  <p align="center">foo</p> ... becomes ... <p> class="wysiwyg-text-align-center">foo</p>
     *                          - clear_br:    converts clear attribute values left/right/all/both to their corresponding css class "wysiwyg-clear-*"
     *                            <br clear="all"> ... becomes ... <br class="wysiwyg-clear-both">
     *                          - align_img:    converts align attribute values (right/left) on <img> to their corresponding css class "wysiwyg-float-*"
     *
     *    - remove:             removes the element and it's content
     *
     *    - rename_tag:         renames the element to the given tag
     *
     *    - set_class:          adds the given class to the element (note: make sure that the class is in the "classes" white list above)
     *
     *    - set_attributes:     sets/overrides the given attributes
     *
     *    - check_attributes:   checks the given HTML attribute via the given method
     *                            - url:      checks whether the given string is an url, deletes the attribute if not
     *                            - alt:      strips unwanted characters. if the attribute is not set, then it gets set (to ensure valid and compatible HTML)
     *                            - numbers:  ensures that the attribute only contains numeric characters
     */
     /*
    "tags": {

    }
};
*/

var wysihtml5ParserRules = {
  classes:{
    "wysiwyg-text-align-center": 1
  },
  tags: {
    b:      {},
    h1:     {},
    h2:     {},
    h3:     {},
    strong: { rename_tag: "b" },
    i:      {},
    em:     { rename_tag: "i" },
    hr:     {},
    ul:     {},
    ol:     {},
    li:     {},
    p:      {},
    tt:     {},
    box:    {},
    code:   {
       "check_attributes": {
          "id": "any"
       }
    },
    span:   {},
    "var":    {},
    img:    {
      "check_attributes": {
          "id": "any"
      }
    },
    comment: { remove: 1 },
    style:   { remove: 1 }
  }
};
