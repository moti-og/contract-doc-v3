<WORKING DOC>

Working with AI is wild. Absolutely and unbelievably wild.

I started writing this file after some time had passed in the project. I began typing while I paired with it to refactor a bunch of shoddy client side logic into a server side state matrix. Figured that would be an easy task to one-shot. lol

Now, refactoring a bunch of hackey client-side logic into an authoritative deterministic state matrix is a great idea in principle. The only problem is actually doing it. A ton of client-side logic that conflicted and was nested all over. I didn't remove it all methodically, and did a poor job with the up-front design. The models complied with my request but there a lot of crap and spaghetti in the code now.

I mean, it's my fault for hacking it all together without detailed plans up front, and just wanting to move fast. But hot damn that creates such a mess when you layer on more features and "justs" and "or what about" and...that's not even considering what the PM's add, you hear me?

But, and in spite of that, it's built. There is now a functional useful prototype, and you can unambiguously see the desired states of the workflows I've built. You may only copy part or none of the code (or you'll just laugh at it). But the key point is that my goal was not to build production software. Which brings me to the purpose of this...

Think of this as a product brief.

Something short and sweet. Brevity. A brief brief. lol, again.

It is designed to be challenged, laughed at, broken, and beaten. And from that, it shall get better. Like a phoenix from a fire, this prototype shall burn, smolder, and smoke. Then a beautiful production version shall rise to our customers. Or something like that.

Back to this file. Given my approach, I wondered how I could be helpful. I figured I'd just share some of the lessons I learned and observations from using AI to build this. Beat this up too.

As a background, I have probably written thousands of words on the new contract document authoring vision. I'm not sure any of them are helpful. This approach is new, and intended to provide a more useful and concrete communication about my ideal future. To accelerate development, since ultimately that's all that matters.

Yep.

Ok, there are lots of other benefits. Such as:

- Provide absolute clarity about the goal
- Immediately unlock a massive feedback pool (aka our customers)
- Immediately transform GTM sales pitches for contracting 
- Rapidly align product, design, and engineering about our targets
- Accelerate development

All of this comes from AI. Without a rapid and working prototype, we over-burden the design team to construct detailed mocks in figma, we force ourselves to visualize complex flow charts in our minds, and more.

As part of this project I split up the roles and responsibilities for AI. I served as the principle editor, and the AI did all the work. Well, that's not entirely true. I kept this file, and all others in this folder, entirely human written. Hence the name.

There were times I modified the code directly, but the majority of the time I had the AI do it. That was tough for small changes, but it was useful for developing trust with the AI. I worked closely and was simultaneously its architect, prodcut manager, designer, customer, support team member, and more. It was the same back to me, and it was my ghost writer.

I used a combination of Claude 3.5, Claude 4, Grok 4, and OpenAI's 5o. 

Some requirements and features are therefore probably stupid. The ones I specified or built, I assume. That context is important for understanding this prototype.

After all that context, here are some observations:

First, we all wear different hats, and AI does too. It wears a hat of insightful programmer, patient partner, and insanely fast developer. It also wears hats of sycophant, liar, junior developer, and saboteur. That latter one is the pits. I swear Claude got his rocks off every time he hit restore. The worst part was that there were so many damn bugs we just kept resolving them in different ways, and then creating more. State machine ftw 4eva

When things worked well, it was a lot of fun. Seriously, vibing with an AI to build cool stuff is really fun. It's like having a super smart person completely attentive to anything you want them to do. Willing, eager, and (usually) well-intentioned.

Second, the quantity of superlatives is still a little off-putting, but oddly enough I'm getting comfortable with it. IDK if it's good to get praised as "Perfect!" for some gibberish that barely relates to the topic.

Third, AI has a hard time understanding the nuanced differences between "simple" and "complex." For example, there's a function to retrieve updated state from the server, refreshActionsDropdownFromMatrix, before loading a button dropdown. The AI obviously wrote it. But minutes after creating that and trying to centralize state machine functions, they wrote a different one. During the planning process, it repeatedly said things were complex and it needed to simplify. But the new method was constructed haphazardly and failed, and it appeared even though I told it to delete conflicting functions and centralize. In fact, when that happened it deleted more than 1k lines of code and didn't tell me. It hid that under the guise of "clean-up" and I had to revert to bring back a functional application.

Fourth, it's not clear why it forgets immediate context. We were rebuilding a dropdown menu to refresh with several methods, including SSE events and auto-refresh. There were also action triggers, based on clicking into the dropdown. The AI spent 10x the necessary time going back and forth between using onfocus() vs onclick(), and I continually told it to copy what existed in the Add-In, and even to use onfocus(). Since, after all, that was working. What's interesting is that it acknowledged but then evaluated while planning, and either ignored or forgot that direction.

Fifth, it loves to do everything custom. Custom banners, custom tables, custom fields. All you can imagine.

Sixth, be patient when you use it. Sometimes (usually) it needs hyper-specific instructions, and if you're not prepared to give it that, it's a crap shot what it will build. Go slow to go fast.

Seventh, protect your documentation. In between this and the previous bullet, Claude decided to delete all my docs. Thanks Claude.

Eighth, serialize multi-tasking with the LLM, parallelize it with yourself. You'll work on one thing with an LLM for a while, and it often makes mistakes. If you one-shot something and it's not trivial, disconnecting is a recipe for tech debt. So engage in the details.

That process can take a while, and it's often demotivating. I found it helpful to context switch to something I was doing more independently, like envisioning a feature. Giving that to the LLM would be disruptive, but I could make progress independently.

Ninth, commit everything. It took me a while to realize this but the LLM's can be pretty aggressive with commits. That's fine if you're expecting it, and it's a helpful way to mitigate their bad habits. Because...use them. When something breaks unexpectedly you can ask them to find out when they break out.

Similarly, the LLM will repeat the same mistakes. For example, it was striking how often it woudl emplace invisible UI elements. Often layer issues but there were also often CSS. I probably had Claude write too much of the front-end, in addition to emojis, our CSS is very !important. And !perfect, and !amazing...

I can see how it might be tough having tons and tons of micro-commits, especially when you try and contextualize something you're building from a while ago. But an LLM makes it trivial.

Tenth, remember your context window. Performance can degrade in the 50's.

Eleventh, 




















Thanks for making it this far. And thank you for building this. Our governments need it. Our citizens need it. Our society needs it.

And you're giving it to them.

Now happy Friday, let's go build this shit.