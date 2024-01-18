---
title: "Modern Java In Action - 동작 파라미터화 코드 전달하기"
categories:
  - Modern Java In Action
tags:
  - 동작 파라미터화
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

**동작 파라미터화(behavior parameterization)**를 이용하면 자주 바뀌는 요구사항에 효과적으로 대응할 수 있다.<br>
**동작 파라미터화란 아직은 어떻게 실행할 것인지 결정하지 않은 코드 블록을 의미한다.** 이 코드 블록은 나중에 프로그램에서 호출한다.
즉, 코드 블록의 실행은 나중으로 미뤄진다. **나중에 실행될 메서드의 인수로 코드 블록을 전달할 수 있다.**<br>

```java
// 녹색 사과 필터링
enum Color { RED, GREEN }

public static List<Apple> filterGreenApples(List<Apple> inventory) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if (GREEN.equals(apple.getColor())) {
            result.add(apple);
        }
    }
    return result;
}
```

이 코드는 사과 리스트에서 enum 값인 빨간색과 초록색을 값으로 지니는 사과들을 필터링하여 반환하는 코드다.<br>
문제없이 잘 동작하지만, 코드에 `GREEN`이라는 값이 하드코딩되어 빨간색 사과를 찾으려면 기존 filterGreenApples메서드와 거의 동일한 코드를 작성해야 한다.
이런 상황에서 코드를 반복하여 사용하지 않고 색을 파라미터화하여 조금 더 유연하게 대응하는 코드를 만들 수 있다.

```java
// 사과의 색을 기준으로 반환하는 메서드
public static List<Apple> filterApplesByColor(List<Apple> inventory, Color color) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if (apple.getColor().equals(color)) {
            result.add(apple);
        }
    }
    return result;
}

// 유사한 코드를 중복 생성하지 않고, 색을 파라미터로 넘겨서 해결
List<Apple> greenApples = filterApplesByColor(inventory, Color.GREEN);
List<Apple> redApples = filterApplesByColor(inventory, Color.RED);
```

위의 코드처럼 색을 기준으로 검색하듯, 무게를 기준으로 리스트를 조회할 수 있다.

```java
// 사과의 무게를 파라미터로 받아 결과를 반환하는 메서드
public static List<Apple> filterApplesByWeight(List<Apple> inventory, int weight) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if (apple.getWeight() > weight) {
            result.add(apple);
        }
    }
    return result;
}
```

사과의 색과 무게를 기준으로 검색하는 메서드가 만들어졌는데, 구현 코드의 대부분이 중복된다.<br>
이는 소프트웨어 공학의 **DRY(don't repeat yourself; 같은 것을 반복하지 말 것) 원칙**을 어기는 것이다.

색과 무게를 filter라는 메서드로 합치는 방법도 있다. 그러기 위해 어떤 기준으로 사과를 필터링할 지 구분하는 또 다른 방법이 필요하다.
따라서 색이나 무게 중 어떤 것을 기준으로 필터링 할지 가리키는 플래그를 추가할 수 있다.(실전에서는 절대 이 방법을 사용하지 말아야 한다.)

```java
// 앞서 정의한 색, 무게 필터링 메서드를 억지로 합쳐놓은 사용하면 안되는 코드
public static List<Apple> filterApples(List<Apple> inventory, Color color, int weight, boolean flag) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if ((flag && apple.getColor().equals(color)) || !flag && apple.getWeight().equals(weight)) {
            result.add(apple);
        }
    }
    return result;
}

List<Apple> greenApples = filterApples(inventory, Color.GREEN, 0, true);
List<APple> heavyApples = filterApples(inventory, null, 150, false);
```

> 이 코드의 문제점은 매개변수를 봤을 때 의도를 알기 힘든 코드이다. <br>
> 게다가 앞으로 요구사항이 바뀌었을 때 유연하게 대응할 수도 없다.

### 동작 파라미터화

메서드의 파라미터를 추가하는 방법이 아닌 변화하는 요구사항에 좀 더 유연하게 대응할 수 있는 방법은 **동작 파라미터를 넘기는 것이다.**
사과의 어떤 속성에 기초해서 boolean값을 반환하는 방법이 있다. 참 또는 거짓을 반환하는 함수를 프레디케이트(Predicate)라고 한다.
선택 조건을 결정하는 인터페이스를 정의하자.

```java
// 선택 조건을 결정하는 인터페이스
// 다형성을 통해 인터페이스를 구현한 클래스들을 모두 넘겨받을 수 있도록 함.
public interface ApplePredicate {
    boolean test(Apple apple);
}

// 150그램 이상인 무거운 사과만 필터링하는 프레디케이트
public class AppleHeavyWeightPredicate implements ApplePredicate {
    @Override
    public boolean test(Apple apple) {
        return apple.getWeight() > 150;
    }
}

// 녹색 사과만 필터링하는 프레디케이트
public class AppleGreenColorPredicate implements ApplePredicate {
    @Override
    public boolean test(Apple apple) {
        return apple.getColor().equals(Color.GREEN);
    }
}
```

ApplePredicate는 사과 선택 **전략을 캡슐화한다.** 위 조건에 따라 filter 메서드가 다르게 동작할 것이다.
이를 **전략 디자인 패턴(strategy design pattern)**이라고 한다. 
전략 디자인 패턴은 각 알고리즘을 캡슐화하는 알고리즘 패밀리를 정의해둔 다음에 런타임에 알고리즘을 선택하는 기법이다.
위 코드에서 ApplePredicate가 알고리즘 패밀리, 구현 클래스들이 전략이다.
이렇게 **동작 파라미터화, 즉 메서드가 다양한 동작(전략)을 받아서 내부적으로 다양한 동작을 수행할 수 있다.**

기존 filterApples 메서드의 시그니처를 변경하여 ApplePredicate를 인수로 받을 수 있도록 고쳐야 한다.

```java
// ApplePredicate를 파라미터로 받도록 수정한 메서드
public static List<Apple> filterApples(List<Apple> inventory, ApplePredicate predicate) {
    List<Apple> result = new ArrayList<>();
    for (Apple apple : inventory) {
        if (predicate.test()) { // ApplePredicate를 구현한 구체 클래스에서 정의한 메서드를 기준으로 동작한다. 
            result.add(apple);
        }
    }
    return result;
}
```

filterApples 메서드가 ApplePredicate 객체를 인수로 받을 수 있게 됐다.<br>
이렇게 하면 filterApples 메서드 내부에서 컬렉션을 반복하는 로직과 
컬렉션의 각 요소에 적용할 동작을 분리할 수 있다는 점에서 소프트웨어 엔지니어링적으로 큰 이득을 얻는다.

이제 ApplePredicate 인터페이스를 구현하여 무게, 색상을 비롯해 다양한 기준을 적용할 수 있게 됐다.<br>
위 예제에서 가장 중요한 구현은 filterApples 메서드의 새로운 동작을 정의하는 test 메서드다.
안타깝게도 메서드는 객체만 인수로 받으므로 test 메서드를 ApplePredicate 객체로 감싸서 전달해야 한다.
test 메서드를 구현하는 객체를 이용해서 boolean 표현식 등을 전달할 수 있으므로 이는 **'코드를 전달'**할 수 있는 것이나 다름없다.


### 한개의 파라미터, 다양한 동작
**컬렉션 탐색 로직과 각 항목에 적용할 동작을 분리할 수 있다는 것**이 동작 파라미터화의 강점이다.<br>
따라서 한 메서드가 다른 동작을 수행하도록 **재활용**할 수 있다.<br>
유연한 API를 만들 때 동작 파라미터화가 중요한 역할을 한다.

### 복잡하고 귀찮은 문제
앞선 예제에서처럼 filterApples 메서드에 새로운 동작을 전달하려면 ApplePredicate 인터페이스를 구현하는 새로운 클래스를 정의하고 인스턴스화해야 한다.
이 번거로운 작업을 **익명 클래스(anonymous class)**라는 기법으로 해결할 수 있다.

### 익명 클래스
익명 클래스는 자바의 지역 클래스와 비슷한 개념이다. 말 그대로 이름이 없는 클래스다.
**익명 클래스를 이용하면 클래스 선언과 인스턴스화를 동시에 할 수 있다.** 즉 즉석에서 필요한 구현을 만들어서 사용할 수 있다.

```java
List<Apple> redApples = filterApples(List<Apple> inventory, new ApplePredicate() { // filterApples 메서드의 동작을 직접 파라미터화
   public boolean test(Apple apple) {
       return RED.equals(apple.getColor());
   } 
});
```

익명 클래스를 사용하여 인터페이스를 구현하는 여러 클래스를 선언하는 과정을 조금 줄였지만, 여전히 많은 공간을 차지한다.
장황한 코드는 가독성도 좋지 않고 유지보수성도 좋지 않다.

### 람다 표현식 사용

```java
// 람다 사용
List<Apple> result = filterApples(inventory, (Apple apple) -> apple.getColor().equals(Color.RED));
```

람다를 사용한 코드는 이전 코드들에 비해 훨씬 간단하고 가독성 좋은 코드가 되었다.

### 리스트 형식으로 추상화

```java
public interface Predicate<T> {
    boolean test(T t);
}

public static <T> List<T> filter(List<T> list, Predicate<T> predicate) { // 형식 파라미터 T
    List<T> result = new ArrayList<>();
    for (T element : list) {
        if (predicate.test(element)) {
            result.add(element);
        }
    } 
    return result;
}
```

리스트 형식을 추상화한 형식 파라미터를 사용하여 사과 뿐 아니라 다른 객체를 대상으로 메서드를 사용할 수 있게 되었다.

```java
List<Apple> redApples = filter(inventory, (Apple apple) -> Color.RED.equals(apple.getColor()));

List<Integer> evenNumbers = filter(numbers, (Integer integer) -> integer % 2 == 0);
```

이렇게 해서 유연성과 간결함을 갖출 수 있다.

**동작 파라미터화 패턴은 동작을(한 조각의 코드로) 캡슐화한 다음에 메서드로 전달해서 메서드의 동작을 파라미터화 한다.**
자바 API의 많은 메서드를 다양한 동작으로 파라미터화할 수 있다.

### Comparator로 정렬하기
컬렉션 정렬은 반복되는 프로그래밍 작업이다.
변화하는 요구사항에 쉽게 대응할 수 있는 다양한 정렬 동작을 수행할 수 있는 코드가 절실하다.

```java
// java.util.Comparator
public interface Comparator<T> {
    int compare(T o1, T o2);
}
```

이 인터페이스를 구현해서 sort 메서드의 동작을 다양화할 수 있다.

```java
// 익명 클래스 사용
inventory.sort(new Comparator<Apple>() {
    public int compare(Apple a1, Apple a2) {
        return a1.getWeight().compareTo(a2.getWeight());
    }
});

// 람다 사용
inventory.sort((Apple a1, Apple a2) -> a1.getWeight().compareTo(a2.getWeight()));
```

### 정리
- 동작 파라미터화에서는 메서드 내부적으로 **다양한 동작을 수행할 수 있도록 코드를 메서드 인수로 전달한다.**
- 동작 파라미터화를 이용하면 변화하는 요구사항에 더 잘 대응할 수 있는 코드를 구현할 수 있으며 나중에 엔지니어링 비용을 줄일 수 있다.
- 코드 전달 기법을 이용하면 동작을 메서드 인수로 전달할 수 있다. 자바 8에서는 인터페이스를 상속받아 여러 클래스를 구현해야 하는 수고를 없앨 수 있는 방법을 제공한다.
- 자바 API의 많은 메서드는 정렬, 스레드, GUI 처리 등을 포함한 다양한 동작으로 파라미터화 할 수 있다.
