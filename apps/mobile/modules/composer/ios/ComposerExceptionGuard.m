#import "ComposerExceptionGuard.h"

@implementation ComposerExceptionGuard

+ (BOOL)run:(void (NS_NOESCAPE ^)(void))block error:(NSError **)error {
  @try {
    block();
    return YES;
  } @catch (NSException *exception) {
    if (error) {
      *error = [NSError errorWithDomain:@"ComposerDictation"
                                   code:3
                               userInfo:@{
                                 NSLocalizedDescriptionKey : exception.reason ?: exception.name,
                                 @"exception" : exception.name,
                               }];
    }
    return NO;
  }
}

@end
