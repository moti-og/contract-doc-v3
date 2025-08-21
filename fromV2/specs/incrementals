2)
the file names don't match and it's confusing
--web says "contract for contracts" even when uploading a new file from the add-in
--the add-in doc title doesn't match word's title
---> don't fix this just explain why it's this way?
---> don't fix this but propose how we might fix it


3)
the problem now is that you can have people working on different files but the approvals and stuff stays synced

4)
there are lots of documents that accumulate in the "default-document" folder. when do you purge?

5)
scripts files are confusing. there is a welcome-modal and welcome-strings. do we need both? which one has master data? can we safely get rid of one? in fact, is it possible to get all the text we expose to the user to be sourced from a single file? with comments, s oi can just go to one place and update text for a button, value, etc

6)
two buttons for a person to approve and have that be persistent. spotlight that within the center of the button container

7)
enable/disable buttons are still not changing state based on clicks
-hook the enable/disable buttons up to the state machine. the states are simply on/off, and the only active button for a user would be the alternate. eg if the state is enable they should only be able to click disable. default to enable. then test and make sure the button state is managed server side the both clients get the same info. do you understand?

8)
-enable / disable features are sending notifications but the button state isn't changing. is that hooked up to the state machine?


9) 
drawer
-move the website content into a drawer or tray on the right side of the screen


10)
clicking the "new features" button causes the banner to change size and then refresh, and you can see a different "new features" button.
can you delete that safely?


11)
modal for "new features" has a brief alternate state upon button click. it shows a different button on the screen and causes the top banner to jump. please remove that. in addition, make the modal bigger on the web view so it's legible.